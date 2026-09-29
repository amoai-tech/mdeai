import type { RentalSearchApiParams } from "@/lib/rental-query-parser";

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
    return "No rentals matched — try a wider budget or another neighborhood.";
  }
  return "";
}

export function fastPathRentalSummary(count: number): string {
  if (count === 0) {
    return "No rentals matched — try a wider budget or another neighborhood.";
  }
  return `Found ${count} rental${count === 1 ? "" : "s"} — see cards below and pins on the map.`;
}
