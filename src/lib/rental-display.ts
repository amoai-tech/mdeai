import type { RentalSearchApiParams } from "@/lib/rental-query-parser";
import { withMapCoverage } from "@/lib/map-result-summary";

export type RentalResultRow = {
  id: string;
  title: string;
  neighborhood: string;
  nightly_price?: number;
  price_monthly?: number;
  /**
   * The listing's own currency (`apartments.currency`), not the searcher's budget currency.
   * Owner onboarding stores COP; the short-stay catalogue is USD. A COP monthly rent labelled
   * with a USD symbol is a lie about the amount, so callers must pass this through.
   */
  currency?: string;
  bedrooms?: number;
  bedrooms_unknown?: boolean;
  source_url?: string;
  wifi?: boolean;
  amenities?: string[];
  tags?: string[];
  availability?: string;
  host_name?: string;
};

// Facts explicitly supplied by the listing. Never infer speed, safety, quietness,
// or a budget match from keywords in unverified description tags.
const BENEFIT_MAP: Array<{ re: RegExp; label: string }> = [
  { re: /\bwi-?fi\b/i, label: "Wi-Fi listed" },
  { re: /\bpet[- ]?friendly\b/i, label: "Pet-friendly listed" },
  { re: /\blong[- ]?stay\b/i, label: "Long-stay listed" },
  { re: /\bparking\b/i, label: "Parking listed" },
];

/** One whole-unit amount in its own currency: USD keeps the `$`, every other currency gets its code. */
export function formatListingMoney(amount: number, currency: string = "USD"): string {
  const unit = (currency || "USD").toUpperCase();
  return `${unit === "USD" ? "$" : `${unit} `}${amount.toLocaleString("en-US")}`;
}

/**
 * Format a listing's prices in **the listing's own currency**.
 *
 * `currency` must be the apartment's currency, never assumed. A COP monthly rent rendered as
 * "$2,400,000/mo" tells the reader the wrong unit; USD keeps the familiar `$` symbol so the
 * short-stay catalogue is unchanged, and every other currency is prefixed with its code.
 *
 * A monthly figure is only estimated from the nightly price when no stored monthly price
 * exists, and is marked `~` when it is.
 */
export function formatRentalPrices(
  nightly?: number | null,
  monthly?: number | null,
  currency: string = "USD",
): {
  nightlyLabel: string | null;
  monthlyLabel: string | null;
} {
  const hasNightly = nightly != null && Number.isFinite(nightly);
  const hasMonthly = monthly != null && Number.isFinite(monthly);
  if (!hasNightly && !hasMonthly) {
    return { nightlyLabel: null, monthlyLabel: null };
  }
  const money = (amount: number) => formatListingMoney(amount, currency);
  return {
    nightlyLabel: hasNightly ? `${money(nightly)}/night` : null,
    monthlyLabel: hasMonthly
      ? `${money(monthly)}/mo`
      : `~${money(Math.round((nightly as number) * 30))}/mo`,
  };
}

export function rentalBenefitBadges(row: RentalResultRow): string[] {
  const haystack = [
    ...(row.amenities ?? []),
    ...(row.tags ?? []),
    row.wifi ? "wifi" : "",
  ].join(" ");
  const out: string[] = [];
  for (const { re, label } of BENEFIT_MAP) {
    if (label === "Wi-Fi listed" && row.wifi === false) continue;
    if (re.test(haystack) && !out.includes(label)) out.push(label);
  }
  if (row.wifi && !out.includes("Wi-Fi listed")) out.unshift("Wi-Fi listed");
  return out.slice(0, 5);
}

/** Listing-backed, customer-visible explanation. Search score/debug metadata is not evidence. */
export function buildMatchReason(
  row: RentalResultRow,
  params?: RentalSearchApiParams,
): string {
  const parts: string[] = [];
  const normalizeNeighborhood = (value: string) =>
    value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US");
  if (
    params?.neighborhood && row.neighborhood &&
    normalizeNeighborhood(params.neighborhood) === normalizeNeighborhood(row.neighborhood)
  ) {
    parts.push(`In ${row.neighborhood}`);
  }
  if (
    params?.minBedrooms != null && row.bedrooms_unknown !== true &&
    row.bedrooms != null && Number.isInteger(row.bedrooms) && row.bedrooms >= params.minBedrooms &&
    (params.maxBedrooms == null || row.bedrooms <= params.maxBedrooms)
  ) {
    const size = row.bedrooms === 0 ? "Studio" : `${row.bedrooms} BR`;
    if (row.bedrooms === params.minBedrooms) {
      parts.push(`${size}, as you asked`);
    } else {
      const asked = params.minBedrooms === 0 ? "studio" : `${params.minBedrooms} BR`;
      parts.push(`${size} (bigger than the ${asked} you asked for)`);
    }
  }
  // A nightly budget is USD. Never compare it to COP or to a monthly-only listing.
  if (
    params?.maxPricePerNight != null && row.price_monthly == null &&
    row.currency?.toUpperCase() === "USD" &&
    row.nightly_price != null && Number.isFinite(row.nightly_price) &&
    row.nightly_price >= 0 && row.nightly_price <= params.maxPricePerNight
  ) {
    parts.push(`${formatListingMoney(row.nightly_price, "USD")}/night within your ${formatListingMoney(params.maxPricePerNight, "USD")}/night budget`);
  } else if (
    params?.maxPriceMonthly != null && row.price_monthly != null &&
    row.currency?.toUpperCase() === (params.budgetCurrency ?? "COP").toUpperCase() &&
    Number.isFinite(row.price_monthly) && row.price_monthly >= 0 &&
    row.price_monthly <= params.maxPriceMonthly
  ) {
    const currency = row.currency.toUpperCase();
    parts.push(`${formatListingMoney(row.price_monthly, currency)}/month within your ${formatListingMoney(params.maxPriceMonthly, currency)}/month budget`);
  }
  // Amenity claims are labelled as listing-provided, not independently verified.
  const badges = rentalBenefitBadges(row);
  if (badges.length) parts.push(badges.slice(0, 2).join(" · "));
  return parts.join(" · ");
}

export function describeSearchCriteria(
  params: RentalSearchApiParams,
  userText: string,
): string {
  const bits: string[] = [];
  if (params.neighborhood) bits.push(params.neighborhood);
  if (params.minBedrooms != null) {
    bits.push(
      params.minBedrooms === 0
        ? "studio"
        : `${params.minBedrooms} bedroom${params.minBedrooms > 1 ? "s" : ""}`,
    );
  }
  if (params.maxPricePerNight != null) {
    bits.push(`under $${params.maxPricePerNight}/night`);
  }
  if (bits.length === 0) {
    return userText.trim() || "Short-term rentals in Medellín";
  }
  return bits.join(" · ");
}

/** Rental fast-path uses cards only — no prose block in chat. */
export function fastPathRentalNarrative(count: number): string {
  if (count === 0) {
    return "No rentals are available in this search right now.";
  }
  return "";
}

/** Shown when a queued message could not be passed to the concierge (already acknowledged). */
export const RENTAL_HANDOFF_FAILED_SUMMARY =
  "I couldn't pass that message along just now. Please send it again.";

/** Shown when the search itself could not run — never confused with "no rentals match". */
export const RENTAL_SEARCH_UNAVAILABLE_SUMMARY =
  "Rental search is temporarily unavailable. Please try again in a moment.";

/**
 * Things a renter may ask for that the rental search cannot filter on yet. The search only
 * understands neighborhood, bedrooms, budget and dates, so anything here is dropped silently
 * unless the answer says so.
 */
const UNAPPLIED_REQUESTS: Array<{ label: string; re: RegExp }> = [
  { label: "pet-friendly", re: /\b(?:pet[- ]?friendly|pets?|dogs?|cats?)\b/i },
  { label: "furnished", re: /\bfurnished\b/i },
  { label: "unfurnished", re: /\bunfurnished\b/i },
  { label: "parking", re: /\bparking\b/i },
  { label: "pool", re: /\b(?:swimming )?pool\b/i },
  { label: "gym", re: /\bgym\b/i },
];

export function unappliedRentalRequests(userText: string): string[] {
  return UNAPPLIED_REQUESTS.filter(({ re }) => re.test(userText)).map(({ label }) => label);
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function unappliedClause(labels: string[]): string {
  return `I can't filter by ${joinLabels(labels)} yet`;
}

/**
 * The one sentence a rental answer uses to admit a request it cannot apply. The fast path and
 * the `search-rentals` tool both call this, so a renter who asks for pets or furnishing hears
 * the same thing whichever chat path answers instead of having the request dropped silently.
 */
export function unappliedRentalNotice(labels: string[]): string | undefined {
  return labels.length ? `${unappliedClause(labels)}, so check each card.` : undefined;
}

/** The same disclosure for an empty result, where there is no card to check. */
export function emptyRentalNotice(labels: string[]): string {
  return labels.length ? `${unappliedClause(labels)}.` : "";
}

export type FastPathRentalSummaryOptions = {
  /** Requests the search cannot filter on (pets, furnished, parking…) — name them, never drop them silently. */
  unappliedRequests?: string[];
  /** The renter gave no neighborhood, size or budget — offer one optional refinement. */
  generic?: boolean;
  /** The renter named a budget the search did not apply — say so instead of implying it did. */
  budgetNotApplied?: boolean;
  /** The monthly budget the search actually applied, e.g. "COP 2,000,000 per month". */
  appliedBudget?: string;
};

/**
 * SAN-407 — answer first, refine second. Zero results is a truthful empty state with one
 * optional follow-up; results come before any refinement question.
 */
export function fastPathRentalSummary(
  count: number,
  pinCount: number,
  options: FastPathRentalSummaryOptions = {},
): string {
  if (count === 0) {
    const budgetNote =
      (options.budgetNotApplied
        ? " Your budget was not applied to this search."
        : options.appliedBudget
          ? ` Applied budget: ${options.appliedBudget}.`
          : "") +
      (options.unappliedRequests?.length
        ? ` ${emptyRentalNotice(options.unappliedRequests)}`
        : "");
    // A broad search that finds nothing means there is nothing to show at all. A specific search
    // that finds nothing only says that THIS search matched nothing — other listings may exist.
    return options.generic
      ? `No rentals are available in this search right now.${budgetNote} Want to try a neighborhood like Laureles?`
      : `No rentals match that search right now.${budgetNote} Want to try another neighborhood or size?`;
  }
  let text = withMapCoverage(`Found ${count} rental${count === 1 ? "" : "s"}`, count, pinCount);
  if (options.budgetNotApplied) {
    text += " I can't filter by monthly budget yet, so check the price on each card.";
  } else if (options.appliedBudget) {
    text += ` Applied budget: ${options.appliedBudget}.`;
  }
  const unapplied = unappliedRentalNotice(options.unappliedRequests ?? []);
  if (unapplied) text += ` ${unapplied}`;
  if (options.generic) {
    text += " Want to narrow by neighborhood or monthly budget?";
  }
  return text;
}
