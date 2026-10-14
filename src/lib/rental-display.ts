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

const BENEFIT_MAP: Array<{ re: RegExp; label: string }> = [
  { re: /\bwifi|wi-fi\b/i, label: "Fast WiFi" },
  { re: /\bpet[- ]?friendly\b/i, label: "Pet-friendly" },
  { re: /\bquiet\b/i, label: "Quiet" },
  { re: /\bnightlife\b/i, label: "Near nightlife" },
  { re: /\bcowork|workspace|remote\b/i, label: "Remote-work friendly" },
  { re: /\blong[- ]?stay\b/i, label: "Long-stay" },
  { re: /\bbudget\b/i, label: "Budget-friendly" },
  { re: /\bparking\b/i, label: "Parking" },
  { re: /\bsafe|security\b/i, label: "Secure building" },
];

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
  const unit = (currency || "USD").toUpperCase();
  const money = (amount: number) =>
    `${unit === "USD" ? "$" : `${unit} `}${amount.toLocaleString("en-US")}`;
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
    if (re.test(haystack) && !out.includes(label)) out.push(label);
  }
  if (row.wifi && !out.includes("Fast WiFi")) out.unshift("Fast WiFi");
  return out.slice(0, 5);
}

export function buildMatchReason(
  row: RentalResultRow,
  params?: RentalSearchApiParams,
): string {
  const parts: string[] = [];
  if (params?.neighborhood && row.neighborhood) {
    parts.push(`In ${row.neighborhood}`);
  }
  if (params?.minBedrooms != null && row.bedrooms != null) {
    parts.push(`${row.bedrooms} BR fits your bedroom ask`);
  }
  if (params?.maxPricePerNight != null && row.nightly_price != null) {
    if (row.nightly_price <= params.maxPricePerNight) {
      parts.push(`Within ~$${params.maxPricePerNight}/night budget`);
    }
  }
  const badges = rentalBenefitBadges(row);
  if (badges.length) parts.push(badges.slice(0, 2).join(" · "));
  return parts.length
    ? parts.join(" · ")
    : "Matches your neighborhood and stay filters.";
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

export type FastPathRentalSummaryOptions = {
  /** The renter gave no neighborhood, size or budget — offer one optional refinement. */
  generic?: boolean;
  /** The renter named a budget the search did not apply — say so instead of implying it did. */
  budgetNotApplied?: boolean;
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
    const budgetNote = options.budgetNotApplied
      ? " Your budget was not applied to this search."
      : "";
    // A broad search that finds nothing means there is nothing to show at all. A specific search
    // that finds nothing only says that THIS search matched nothing — other listings may exist.
    return options.generic
      ? `No rentals are available in this search right now.${budgetNote} Want to try a neighborhood like Laureles?`
      : `No rentals match that search right now.${budgetNote} Want to try another neighborhood or size?`;
  }
  let text = withMapCoverage(`Found ${count} rental${count === 1 ? "" : "s"}`, count, pinCount);
  if (options.budgetNotApplied) {
    text += " Your budget isn't applied yet, so these aren't filtered by price — check each card.";
  }
  if (options.generic) {
    text += " Want to narrow by neighborhood or monthly budget?";
  }
  return text;
}
