/**
 * Pure rental query classifier — used by rental fast-path (mirrors concierge gate).
 */
import type { ConciergeWorkingMemory } from "@/lib/types";

export type RentalSearchApiParams = {
  neighborhood?: string;
  minBedrooms?: number;
  maxPricePerNight?: number;
  /** Exact monthly ceiling, never a guessed nightly conversion. */
  maxPriceMonthly?: number;
  budgetCurrency?: "COP" | "USD";
  limit?: number;
  /** Natural-language query for hybrid_search_listings + rental_signals. */
  queryText?: string;
  /** ISO date YYYY-MM-DD — start of stay window */
  checkIn?: string;
  /** ISO date YYYY-MM-DD — end of stay window */
  checkOut?: string;
  stayType?: "nightly" | "monthly" | "total_trip";
};

function attachQueryText(
  params: RentalSearchApiParams,
  text: string,
  s: RentalQuerySignals,
): RentalSearchApiParams {
  const dated: RentalSearchApiParams = {
    ...params,
    ...(s.checkIn && { checkIn: s.checkIn }),
    ...(s.checkOut && { checkOut: s.checkOut }),
    ...(s.budgetType && { stayType: s.budgetType }),
    ...(s.maxPriceMonthly != null && { maxPriceMonthly: s.maxPriceMonthly, budgetCurrency: s.budgetCurrency }),
  };
  // SAN-407: a monthly or whole-trip budget is not a nightly cap. `parseBudget` still derives a
  // per-night figure for display and routing signals, but sending it as a search filter would
  // present a guess ("4,000,000 / 30") as exact eligibility. The validated amount + currency +
  // period contract belongs to SAN-386; until then the stay type travels and the cap does not.
  if (s.budgetType === "monthly" || s.budgetType === "total_trip") {
    delete dated.maxPricePerNight;
  }
  if (s.confidence >= 0.6 || s.hasNomad || s.hasCafeOrGym || s.hasVibeOrUseCase) {
    return { ...dated, queryText: text.trim() };
  }
  return dated;
}

export type RentalQuerySignals = {
  hasBudget: boolean;
  hasBedrooms: boolean;
  hasVibeOrUseCase: boolean;
  hasNeighborhood: boolean;
  hasDateRange: boolean;
  hasNomad: boolean;
  hasCafeOrGym: boolean;
  cityWide: boolean;
  confidence: number;
  neighborhood?: string;
  minBedrooms?: number;
  maxPricePerNight?: number;
  maxPriceMonthly?: number;
  budgetCurrency?: "COP" | "USD";
  budgetType?: "nightly" | "monthly" | "total_trip";
  dateRangeLabel?: string;
  checkIn?: string;
  checkOut?: string;
  /** Explicit result count from query (e.g., "top 5", "show 3") */
  explicitLimit?: number;
};

/**
 * Asking for the whole city ("Search apartments Medellín", "anywhere in Medellín") starts a
 * fresh search. Without this, any message with saved context was treated as a refinement and
 * silently reused the previous neighborhood, size and budget.
 */
const WHOLE_CITY_WORDS = new Set(["medellín", "medellin", "anywhere", "everywhere", "citywide"]);

/** Multi-word ways to say "the whole city", English and Spanish; "any|all" also takes "the". */
const WHOLE_CITY_PHRASES: readonly (readonly string[])[] = [
  ["any", "neighborhood"], ["any", "neighborhoods"], ["any", "neighbourhood"], ["any", "neighbourhoods"],
  ["all", "neighborhoods"], ["all", "neighbourhoods"],
  ["whole", "city"], ["entire", "city"], ["across", "city"], ["city", "wide"],
  ["cualquier", "barrio"], ["cualquier", "zona"], ["toda", "la", "ciudad"],
];

function hasSequence(words: readonly string[], at: number, phrase: readonly string[]): boolean {
  return phrase.every((word, k) => words[at + k] === word);
}

/**
 * Token matching, not a regex: no backtracking on user text, and "anywhereville" or
 * "Medellínshire" do not count. Filler "the" is skipped so "across the city" matches.
 */
export function requestsWholeCity(text: string): boolean {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñ]+/)
    .filter((w) => w && w !== "the" && w !== "of");
  return words.some(
    (word, i) =>
      WHOLE_CITY_WORDS.has(word) || WHOLE_CITY_PHRASES.some((phrase) => hasSequence(words, i, phrase)),
  );
}

/** Words that may sit around a whole-city word in a plain reply ("Anywhere in Medellín is fine"). */
const WHOLE_CITY_REPLY_FILLER = new Set([
  "is", "are", "fine", "ok", "okay", "works", "work", "goes", "good", "great", "sure", "yes", "yeah",
  "please", "any", "all", "anything", "in", "city", "whole", "entire", "across", "wide", "too",
  "neighborhood", "neighborhoods", "neighbourhood", "neighbourhoods",
  "cualquier", "cualquiera", "barrio", "zona", "toda", "la", "ciudad", "en", "está", "esta", "bien", "me", "da", "igual",
]);

/**
 * A plain reply that only says "anywhere" ("Anywhere is fine", "Medellín", "any neighborhood works").
 * Stricter than requestsWholeCity: any other word ("Is Medellín safe at night?", "anywhere but El
 * Poblado") means the message is about something else and must not be turned into a search.
 */
export function isWholeCityReply(text: string): boolean {
  if (!requestsWholeCity(text)) return false;
  const words = text.toLowerCase().split(/[^a-z0-9áéíóúñ]+/).filter(Boolean);
  return words.length <= 8 && words.every((w) => WHOLE_CITY_WORDS.has(w) || WHOLE_CITY_REPLY_FILLER.has(w));
}

const RENTAL_INTENT_RE =
  /\b(rental|rentals|apartment|apartments|airbnb|stay|stays|lodging|for rent|list.*rent)\b/i;

const EVENT_INTENT_RE =
  /\b(events?|concert|concerts|salsa|nightlife|festival|ticket|tickets|what'?s on)\b/i;

const NEIGHBORHOOD_PATTERNS: Array<{ neighborhood: string; re: RegExp }> = [
  { neighborhood: "Laureles", re: /\b(laureles|laureless)\b/i },
  { neighborhood: "El Poblado", re: /\b(el poblad[oa]|poblado|provenza)\b/i },
  { neighborhood: "Envigado", re: /\benvigado\b/i },
  { neighborhood: "Belén", re: /\bbel[eé]n\b/i },
  { neighborhood: "Estadio", re: /\bestadio\b/i },
];

const TOP_N_RE = /\b(?:top|show|find|get)\s+(?:me\s+)?(\d+)\s+(?:rentals?|apartments?|listings?|units?|homes?|places?)\b/i;

function parseExplicitLimit(text: string): number | undefined {
  const m = text.match(TOP_N_RE);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return Math.min(Math.max(n, 1), 20);
  }
  return undefined;
}

const BEDROOM_RE =
  /\b(\d+|one|two|three|four)[\s-]?(?:br|bed(?:room)?s?)\b|\b(studio)\b/i;

const BEDROOM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

const VIBE_RE =
  /\b(remote work|remote-work|digital nomad|nomad|nightlife|family|quiet|long[- ]term|monthly|workspace|pet[- ]friendly|wifi|cowork)\b/i;

const CAFE_GYM_RE = /\b(caf[eé]s?|coffee|gym|gyms|coworking)\b/i;

const NOMAD_RE = /\b(digital nomad|nomad|remote work|remote-work|work from|workspace|wifi|cowork)\b/i;

const MONTHLY_RE = /\b(month|monthly|per month|\/month|mes)\b/i;
const TRIP_RE = /\b(for the trip|total|10 days|two weeks|\d+\s+days)\b/i;
const MEDELLIN_CITY_RE = /\bmedell[ií]n\b/i;

/**
 * Longest message the rental fast path will read. A rental request is a sentence or two; anything
 * longer goes to the concierge, which has its own limits. Bounding the input keeps every regex
 * in this module O(n) on a small n regardless of what a client sends (Codacy regex-dos).
 */
export const MAX_RENTAL_TEXT_CHARS = 1000;

/**
 * SQL statements and prompt-override phrases (SAN-1054). Deliberately narrow: each SQL alternative
 * needs SQL *structure* ("drop table", "delete from <name>", "union select"), so ordinary English
 * after a semicolon ("; drop by later", "; select few") is not caught. Every repeat is bounded
 * ({1,5}, {0,40}) so there is no unbounded backtracking even without the length cap.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(?:drop|truncate|alter)\s{1,5}(?:table|database|schema)\b/i,
  /\bdelete\s{1,5}from\s{1,5}[a-z_.]{1,40}\s{0,5}(?:where\b|;|$)/i,
  /\binsert\s{1,5}into\s{1,5}[a-z_.]{1,40}\b/i,
  /\bupdate\s{1,5}[a-z_.]{1,40}\s{1,5}set\b/i,
  /\bunion\s{1,5}(?:all\s{1,5})?select\b/i,
  /\bselect\s{1,5}\*\s{1,5}from\b/i,
  /\bignore\s{1,5}(?:all|any|previous|prior|the)\b[^.]{0,40}\b(?:rules?|instructions?|prompts?)\b/i,
  /\bsystem\s{1,5}prompt\b/i,
];

/** True when the text carries SQL or instruction-override markers. Exported for tests. */
export function looksLikeInjection(text: string): boolean {
  // Bounded like every other rental-text check: scan at most MAX_RENTAL_TEXT_CHARS.
  const bounded = text.length > MAX_RENTAL_TEXT_CHARS ? text.slice(0, MAX_RENTAL_TEXT_CHARS) : text;
  return INJECTION_PATTERNS.some((pattern) => pattern.test(bounded));
}

const MONTH_IDX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const DATE_RANGE_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\b/i;

function parseDateRange(text: string): { label?: string; checkIn?: string; checkOut?: string } {
  const m = text.match(DATE_RANGE_RE);
  if (m) {
    const monthIdx = MONTH_IDX[m[1].toLowerCase().slice(0, 3)] ?? -1;
    if (monthIdx >= 0) {
      const startDay = Number(m[2]);
      const endDay = Number(m[3]);
      const ref = new Date();
      let year = ref.getFullYear();
      if (new Date(year, monthIdx, endDay) < ref) year++;
      const pad = (n: number) => String(n).padStart(2, "0");
      const mon = pad(monthIdx + 1);
      const monthLabel = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      return {
        label: `${monthLabel} ${startDay}–${endDay}`,
        checkIn: `${year}-${mon}-${pad(startDay)}`,
        checkOut: `${year}-${mon}-${pad(endDay)}`,
      };
    }
  }
  if (/\bthis weekend\b/i.test(text)) {
    const ref = new Date();
    const daysToSat = (6 - ref.getDay() + 7) % 7 || 7;
    const sat = new Date(ref);
    sat.setDate(ref.getDate() + daysToSat);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { label: "this weekend", checkIn: fmt(sat), checkOut: fmt(sun) };
  }
  if (/\btomorrow\b/i.test(text)) {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    const d = tom.toISOString().slice(0, 10);
    return { label: "tomorrow", checkIn: d, checkOut: d };
  }
  return {};
}

/**
 * True for a thousands-grouped integer such as "3.500.000" or "3,500,000".
 * Scans each separator-delimited part once, so it is linear and cannot backtrack —
 * the previous nested-quantifier form was flagged by static analysis as a ReDoS
 * candidate.
 */
function isThousandsGroupedInteger(value: string): boolean {
  const parts = value.split(/[.,]/);
  if (parts.length < 2 || parts.length > 6) return false;
  if (parts[0].length < 1 || parts[0].length > 3) return false;
  for (const part of parts) if (!/^\d+$/.test(part)) return false;
  return parts.slice(1).every((part) => part.length === 3);
}

/** Parse explicit monthly amounts in a *named currency* without guessing USD↔COP FX.
 * Digits with 3-digit groupings are integer prices; decimal "3,5"/"3.5" only
 * scales when the renter wrote million/M. Unstated currencies remain unfiltered.
 *
 * A COP amount written in millions (or at least COP 1,000,000) without an explicit
 * period is a monthly rent: that is how the Colombian catalogue is priced, and
 * "under COP 3 million" is the normal way a renter says it. USD still requires an
 * explicit monthly word, and any nightly marker wins over the COP inference.
 */
function parseExactMonthlyBudget(text: string): { amount: number; currency: "COP" | "USD" } | null {
  const magnitude = "(millones?|mill[oó]n|million|millions|m|mil|k)";
  const number = "(\\d[\\d.,]{0,16})";
  // Named currency before price, a dollar symbol, or currency after price.
  const prefix = text.match(new RegExp(`\\b(cop|usd|pesos?|dollars?)\\s*${number}\\s*${magnitude}?`, "i"));
  const dollars = text.match(new RegExp(`\\$\\s*${number}\\s*${magnitude}?`, "i"));
  const suffix = text.match(new RegExp(`${number}\\s*${magnitude}?\\s*(cop|usd|pesos?|dollars?)\\b`, "i"));
  const match = prefix ?? dollars ?? suffix;
  if (!match) return null;
  const currencyToken = (prefix ? prefix[1] : dollars ? "$" : suffix?.[3] ?? "").toLowerCase();
  const currency: "COP" | "USD" = /^(cop|peso)/.test(currencyToken) ? "COP" : "USD";
  const rawAmount = prefix ? prefix[2] : dollars ? dollars[1] : suffix?.[1] ?? "";
  const magnitudeToken = (prefix ? prefix[3] : dollars ? dollars[2] : suffix?.[2] ?? "")?.toLowerCase() ?? "";
  const grouped = isThousandsGroupedInteger(rawAmount);
  const amount = Number(grouped ? rawAmount.replace(/[.,]/g, "") : rawAmount.replace(",", "."));
  const multiple = /^(m|millones?|mill[oó]n|millions?)$/.test(magnitudeToken)
    ? 1_000_000 : /^(mil|k)$/.test(magnitudeToken) ? 1_000 : 1;
  const ceiling = amount * multiple;
  if (!Number.isSafeInteger(ceiling) || ceiling <= 0) return null;

  const hasMonthlyWord = MONTHLY_RE.test(text);
  const hasNightlyWord = /\b(?:night|nightly|noche)\b|\/\s*night|per\s+night/i.test(text);
  const copMonthlyWithoutWord =
    currency === "COP" && !hasNightlyWord && (multiple === 1_000_000 || ceiling >= 1_000_000);
  if (!hasMonthlyWord && !copMonthlyWithoutWord) return null;

  return { amount: ceiling, currency };
}

const BUDGET_MAGNITUDE = "(m|k|millions?|millones?|mill[oó]n|mil)";

function parseBudget(text: string): {
  maxPricePerNight?: number;
  budgetType?: "nightly" | "monthly" | "total_trip";
} {
  const underMatch = text.match(
    new RegExp(
      `(?:under|below|max|up to)\\s*\\$?\\s*([\\d,.]+)\\s*${BUDGET_MAGNITUDE}?\\s*(?:\\/\\s*night|per night|night)?`,
      "i",
    ),
  );
  const plainMatch = text.match(new RegExp(`\\$\\s*([\\d,.]+)\\s*${BUDGET_MAGNITUDE}?`, "i"));
  const amountStr = underMatch?.[1] ?? plainMatch?.[1];
  if (!amountStr) {
    // "cheap" / "affordable" is a preference, not a number. It used to become a hard
    // $60/night cap that no renter had stated (SAN-407).
    return {};
  }

  const magnitudeToken = (underMatch?.[2] ?? plainMatch?.[2] ?? "").toLowerCase();
  let amount = Number(amountStr.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return {};

  if (magnitudeToken) {
    // "2 million pesos" is a COP amount, never "$2 a night": the digits alone are not a price,
    // and converting COP to a USD nightly cap is a guess (SAN-1502). Leave the budget unapplied
    // so the answer says so instead of filtering on a number the renter never gave.
    if (!/\$\s*[\d.,]/.test(text)) return {};
    amount *=
      /^(m|millions?|millones?|mill[oó]n)$/.test(magnitudeToken) ? 1_000_000 : 1_000;
  }

  if (MONTHLY_RE.test(text) && amount >= 400) {
    return { maxPricePerNight: Math.round(amount / 30), budgetType: "monthly" };
  }
  if (TRIP_RE.test(text) && amount >= 300) {
    const daysMatch = text.match(/(\d+)\s+days?/i);
    const days = daysMatch ? Number(daysMatch[1]) : 30;
    return {
      maxPricePerNight: Math.round(amount / Math.max(days, 1)),
      budgetType: "total_trip",
    };
  }
  if (amount >= 400 && !/\bnight(?:ly)?\b/i.test(text)) {
    return { maxPricePerNight: Math.round(amount / 30), budgetType: "monthly" };
  }
  return { maxPricePerNight: amount, budgetType: "nightly" };
}

function parseBedrooms(text: string): number | undefined {
  const m = text.match(BEDROOM_RE);
  if (!m) return undefined;
  if (m[2]) return 0; // studio
  const raw = m[1].toLowerCase();
  const n = Number(raw);
  return Number.isFinite(n) ? n : BEDROOM_WORDS[raw];
}

/** User message is clearly about rentals, not events or cafés. */
export function looksLikeRentalSearch(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > MAX_RENTAL_TEXT_CHARS) return false;
  if (EVENT_INTENT_RE.test(t) && !RENTAL_INTENT_RE.test(t)) return false;
  return RENTAL_INTENT_RE.test(t) || BEDROOM_RE.test(t) || /\/night|per night/i.test(t);
}

/** Budget, bedrooms, or neighborhood in text — not generic chit-chat. */
export function hasRentalSignals(text: string): boolean {
  if (looksLikeRentalSearch(text)) return true;
  const s = scoreRentalQuery(text);
  return s.hasBudget || s.hasBedrooms || s.hasNeighborhood;
}

export function looksLikeNonRentalSearch(text: string): boolean {
  const t = text.trim();
  if (looksLikeRentalSearch(t)) return false;
  return EVENT_INTENT_RE.test(t);
}

export function scoreRentalQuery(text: string): RentalQuerySignals {
  const normalized = text.trim();
  const exactMonthly = parseExactMonthlyBudget(normalized);
  const { maxPricePerNight, budgetType } = exactMonthly
    ? { maxPricePerNight: Math.round(exactMonthly.amount / 30), budgetType: "monthly" as const }
    : parseBudget(normalized);
  const minBedrooms = parseBedrooms(normalized);
  const explicitLimit = parseExplicitLimit(normalized);

  let neighborhood: string | undefined;
  for (const { neighborhood: n, re } of NEIGHBORHOOD_PATTERNS) {
    if (re.test(normalized)) {
      neighborhood = n;
      break;
    }
  }

  const hasBudget =
    maxPricePerNight != null ||
    /\b(cheap|budget|luxury|affordable|under\s+\$)\b/i.test(normalized);
  const hasBedrooms = minBedrooms != null;
  const hasVibeOrUseCase = VIBE_RE.test(normalized);
  const hasNomad = NOMAD_RE.test(normalized);
  const hasCafeOrGym = CAFE_GYM_RE.test(normalized);
  const hasQuiet = /\bquiet\b/i.test(normalized);
  const hasNeighborhood = neighborhood != null;
  const { label: dateRangeLabel, checkIn, checkOut } = parseDateRange(normalized);
  const hasDateRange = dateRangeLabel != null;
  const cityWide = MEDELLIN_CITY_RE.test(normalized) && !hasNeighborhood;

  let confidence = 0.2;
  if (hasBudget && hasBedrooms) confidence = 0.9;
  else if (hasBudget && hasNeighborhood && budgetType === "monthly") confidence = 0.76;
  else if (hasBudget && hasNeighborhood) confidence = 0.75;
  else if (hasNomad && hasNeighborhood) confidence = 0.72;
  else if (hasBedrooms && hasNeighborhood) confidence = 0.7;
  else if (hasVibeOrUseCase && hasNeighborhood) confidence = 0.65;
  else if (hasQuiet && hasCafeOrGym && hasNeighborhood) confidence = 0.62;
  else if (hasBudget && hasVibeOrUseCase) confidence = 0.65;
  else if (hasBedrooms) confidence = 0.55;
  else if (hasBudget && hasDateRange && cityWide) confidence = 0.78;
  else if (hasBudget && hasDateRange) confidence = 0.72;
  else if (hasBudget) confidence = 0.5;
  // SAN-823: neighborhood + rental noun → fast-path (was 0.35 → clarify loop)
  else if (hasNeighborhood && RENTAL_INTENT_RE.test(normalized)) confidence = 0.62;
  else if (hasNeighborhood) confidence = 0.35;

  return {
    hasBudget,
    hasBedrooms,
    hasVibeOrUseCase,
    hasNeighborhood,
    hasDateRange,
    cityWide,
    hasNomad,
    hasCafeOrGym,
    confidence,
    neighborhood,
    minBedrooms,
    maxPricePerNight,
    maxPriceMonthly: exactMonthly?.amount,
    budgetCurrency: exactMonthly?.currency,
    budgetType,
    dateRangeLabel,
    checkIn,
    checkOut,
    explicitLimit,
  };
}

/**
 * True when the renter stated an explicit budget the search cannot yet enforce (an amount with a
 * currency or period — "under COP 4M/month", "$2000 per month", "up to 3.500.000 pesos").
 * Vague preferences ("cheap", "affordable", "budget apartments") are NOT a stated budget, so the
 * chat does not tell the renter a budget "wasn't applied" when they never gave one. Explicit
 * nightly USD caps are enforced by the search; the caller checks whether a cap was actually sent.
 */
const EXPLICIT_BUDGET_PATTERNS: readonly RegExp[] = [
  // currency word or symbol directly followed by an amount: "COP 4M", "$2000", "pesos 3.500.000"
  /(?:\b(?:cop|pesos?|usd|dollars?)\b|[$€])\s{0,3}\d/i,
  // amount followed by a currency word: "3.500.000 pesos", "80 dollars"
  /\d[\d.,]{0,15}\s{0,3}(?:m|k|million|millones|mil)?\s{0,3}(?:cop|pesos?|usd|dollars?)\b/i,
  // amount with a magnitude AND a period: "4M/month", "4 million a month", "2k per night"
  /\b\d[\d.,]{0,15}\s{0,2}(?:m|k|million|millones)\b\s{0,3}(?:\/|per\s|a\s|al\s)?\s{0,3}(?:month|mes|night|noche)\b/i,
  // "budget" followed closely by a number
  /\bbudget\b\D{0,20}\d/i,
  // limit word followed by a money-looking amount (not "under 2 bedrooms", "up to 3 people")
  /\b(?:under|below|max|up to|hasta|menos de)\s{0,3}(?:(?:cop|usd|\$)\s{0,3}\d|\d[\d.,]{2,15}|\d\s{0,2}(?:m|k|million|millones)\b)/i,
];

export function statesBudget(text: string): boolean {
  if (text.length > MAX_RENTAL_TEXT_CHARS) return false;
  return EXPLICIT_BUDGET_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * True when the renter named a budget the search did not apply.
 *
 * A parsed cap counts as applied, including `maxPriceMonthly`: the search enforces it through
 * `rentalMonthlyBudgetPredicate`, so the answer must not tell that renter the monthly budget
 * was ignored.
 */
export function budgetNotApplied(
  userText: string,
  params: Pick<RentalSearchApiParams, "maxPricePerNight" | "maxPriceMonthly">,
): boolean {
  const applied = params.maxPricePerNight != null || params.maxPriceMonthly != null;
  return !applied && statesBudget(userText);
}

const FAST_PATH_LIMIT = 8;

function effectiveLimit(s: RentalQuerySignals): number {
  return s.explicitLimit ?? FAST_PATH_LIMIT;
}

function mergedBudgetFields(
  q: ConciergeWorkingMemory["lastRentalQuery"],
  s: RentalQuerySignals,
): Pick<RentalSearchApiParams, "maxPricePerNight" | "maxPriceMonthly" | "budgetCurrency"> {
  // A refinement without a new budget keeps the budget the renter last used.
  if (!s.hasBudget) {
    return {
      maxPricePerNight: q?.maxPricePerNight,
      maxPriceMonthly: q?.maxPriceMonthly,
      budgetCurrency: q?.budgetCurrency,
    };
  }
  // A new budget replaces the stored one, even when it cannot be applied exactly. Carrying the
  // superseded ceiling would filter the new search with a number the renter just replaced — e.g.
  // a “$2000 total for the trip” request must not keep a COP 2,000,000 monthly cap.
  if (s.budgetType === "monthly" || s.budgetType === "total_trip") {
    return {
      maxPricePerNight: undefined,
      maxPriceMonthly: s.maxPriceMonthly,
      budgetCurrency: s.budgetCurrency,
    };
  }
  if (s.budgetType === "nightly") {
    return {
      maxPricePerNight: s.maxPricePerNight,
      maxPriceMonthly: undefined,
      budgetCurrency: undefined,
    };
  }
  return { maxPricePerNight: undefined, maxPriceMonthly: undefined, budgetCurrency: undefined };
}

export function buildRentalSearchParams(
  text: string,
  memory: ConciergeWorkingMemory,
): RentalSearchApiParams | null {
  if (text.length > MAX_RENTAL_TEXT_CHARS) return null;
  // SAN-1054 / RE-SEC-001: text that carries SQL or instruction-override markers is never
  // promoted to an automatic search, whatever else it says ("rentals in Laureles; DROP TABLE…").
  // It keeps its old route (clarify / concierge), where the agent's own guardrails apply.
  if (looksLikeInjection(text)) return null;
  if (looksLikeNonRentalSearch(text)) return null;

  const s = scoreRentalQuery(text);
  // A whole-city request is a new search, not a refinement: ignore what the last search stored.
  const cityWide = requestsWholeCity(text);
  const q = cityWide ? undefined : memory.lastRentalQuery;
  const limit = effectiveLimit(s);

  // After a rental search, "Anywhere is fine" or "Medellín" widens the location only. Do not send
  // these short replies to the concierge or search semantically for the literal word "anywhere":
  // search the whole city, and keep the size, budget and dates the renter already gave.
  const lastQuery = memory.lastRentalQuery;
  if (cityWide && lastQuery && !looksLikeRentalSearch(text)) {
    return {
      minBedrooms: lastQuery.minBedrooms,
      maxPricePerNight: lastQuery.maxPricePerNight,
      maxPriceMonthly: lastQuery.maxPriceMonthly,
      budgetCurrency: lastQuery.budgetCurrency,
      checkIn: lastQuery.checkIn,
      checkOut: lastQuery.checkOut,
      stayType: lastQuery.budgetType,
      limit,
    };
  }

  if (q?.genericAskPending) {
    const merged: RentalSearchApiParams = {
      neighborhood: s.neighborhood ?? q.neighborhood,
      minBedrooms: s.minBedrooms ?? q.minBedrooms,
      ...mergedBudgetFields(q, s),
      checkIn: s.checkIn ?? q.checkIn,
      checkOut: s.checkOut ?? q.checkOut,
      stayType: s.budgetType ?? q.budgetType,
      limit,
    };
    if (
      merged.neighborhood ||
      merged.minBedrooms != null ||
      merged.maxPricePerNight != null ||
      merged.maxPriceMonthly != null
    ) {
      return attachQueryText(merged, text, s);
    }
    if (hasRentalSignals(text)) {
      return attachQueryText({ limit }, text, s);
    }
  }

  if (q && !q.genericAskPending) {
    return attachQueryText(
      {
        neighborhood: s.neighborhood ?? q?.neighborhood,
        minBedrooms: s.minBedrooms ?? q?.minBedrooms,
        ...mergedBudgetFields(q, s),
        checkIn: q?.checkIn,
        checkOut: q?.checkOut,
        stayType: s.budgetType ?? q?.budgetType,
        limit,
      },
      text,
      s,
    );
  }

  if (!looksLikeRentalSearch(text)) return null;

  if (s.hasBudget && s.hasNeighborhood) {
    return attachQueryText(
      {
        neighborhood: s.neighborhood,
        minBedrooms: s.minBedrooms,
        maxPricePerNight: s.maxPricePerNight,
        limit,
      },
      text,
      s,
    );
  }

  if (s.confidence >= 0.6) {
    return attachQueryText(
      {
        neighborhood: s.neighborhood,
        minBedrooms: s.minBedrooms,
        maxPricePerNight: s.maxPricePerNight,
        limit,
      },
      text,
      s,
    );
  }

  if (
    q?.neighborhood ||
    q?.minBedrooms != null ||
    q?.maxPricePerNight != null
  ) {
    return attachQueryText(
      {
        neighborhood: q.neighborhood,
        minBedrooms: q.minBedrooms,
        maxPricePerNight: q.maxPricePerNight,
        maxPriceMonthly: q.maxPriceMonthly,
        budgetCurrency: q.budgetCurrency,
        checkIn: q.checkIn,
        checkOut: q.checkOut,
        stayType: q.budgetType,
        limit,
      },
      text,
      s,
    );
  }

  // SAN-407: recognised rental-search intent with no optional slots ("Search apartments
  // Medellín") is still a search. It goes out with the renter's own words and nothing invented;
  // any refinement question comes after the answer.
  // Whatever the renter did state (neighborhood, size, budget) still travels as a filter; only
  // what they did not say is left out.
  return {
    ...attachQueryText(
      {
        limit,
        neighborhood: s.neighborhood,
        minBedrooms: s.minBedrooms,
        maxPricePerNight: s.maxPricePerNight,
      },
      text,
      s,
    ),
    queryText: text.trim(),
  };
}

export function canFastPathRentalSearch(
  text: string,
  memory: ConciergeWorkingMemory,
): boolean {
  if (text.length > MAX_RENTAL_TEXT_CHARS) return false;
  if (looksLikeNonRentalSearch(text)) return false;
  if (memory.lastRentalQuery?.genericAskPending) {
    return buildRentalSearchParams(text, memory) != null;
  }
  if (!looksLikeRentalSearch(text) && !(memory.lastRentalQuery && requestsWholeCity(text))) {
    return false;
  }
  return buildRentalSearchParams(text, memory) != null;
}
