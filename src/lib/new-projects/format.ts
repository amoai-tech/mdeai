import type { NewProjectUnitType } from "./types";

/** Shown whenever the sources did not publish a fact. Never render `0`, `false` or "available". */
export const NOT_PUBLISHED = "Not published";

const amountFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const areaFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCopAmount(cop: number): string {
  return `COP ${amountFormatter.format(cop)}`;
}

function formatAmountFromCents(cents: number, currency: string): string {
  const amount = Math.round(cents / 100);
  return currency === "COP" ? formatCopAmount(amount) : `${currency} ${amountFormatter.format(amount)}`;
}

/** Formats a single price-from value at project level, or null when unpublished. */
export function formatPriceFromCents(
  cents: number | null | undefined,
  currency = "COP",
): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  return formatAmountFromCents(cents, currency);
}

/**
 * "From COP 575,000,000" / "COP 370,406,379 – 834,843,174" / "Not published".
 * A single known value is labelled "From" so it can never read as an exact unit price.
 */
export function formatPriceRangeLabel(
  fromCents: number | null,
  toCents: number | null,
  currency = "COP",
): string {
  const from = formatPriceFromCents(fromCents, currency);
  const to = formatPriceFromCents(toCents, currency);
  if (from && to && from !== to) {
    // A range reads better with the currency stated once: "COP 370,406,379 – 834,843,174".
    if (fromCents == null || toCents == null) return `${from} – ${to}`;
    const fromAmount = amountFormatter.format(Math.round(fromCents / 100));
    const toAmount = amountFormatter.format(Math.round(toCents / 100));
    return currency === "COP"
      ? `COP ${fromAmount} – ${toAmount}`
      : `${currency} ${fromAmount} – ${toAmount}`;
  }
  if (from) return `From ${from}`;
  if (to) return `Up to ${to}`;
  return NOT_PUBLISHED;
}

export function formatArea(m2: number | null | undefined): string | null {
  if (m2 == null || !Number.isFinite(m2)) return null;
  return `${areaFormatter.format(m2)} m²`;
}

export function formatBedrooms(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} bedrooms`;
  const value = min ?? max;
  return value === 1 ? "1 bedroom" : `${value} bedrooms`;
}

export function formatBathrooms(bathrooms: number | null | undefined): string | null {
  if (bathrooms == null) return null;
  return bathrooms === 1 ? "1 bathroom" : `${bathrooms} bathrooms`;
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  pre_launch: "Pre-launch",
  pre_sale: "Pre-sale · on plans",
  under_construction: "Under construction",
  delivered: "Delivered",
  sold_out: "Sold out",
};

export function projectStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return PROJECT_STATUS_LABELS[status] ?? status;
}

export function formatDelivery(
  year: number | null,
  quarter: number | null,
  note: string | null,
): string {
  if (year != null) {
    return quarter != null ? `Delivery ${year} · Q${quarter}` : `Delivery ${year}`;
  }
  if (note && note.trim() !== "") return `Delivery: ${note.trim()}`;
  return "Delivery date not published";
}

export function formatVerified(iso: string | null | undefined): string {
  if (!iso) return "Not yet verified";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not yet verified";
  return `Verified ${dateFormatter.format(date)}`;
}

export function formatCheckedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormatter.format(date);
}

export function visLabel(vis: boolean | null): string | null {
  if (vis == null) return null;
  return vis ? "VIS" : "Not VIS";
}

export function confidenceLabel(confidence: string | null): string | null {
  if (!confidence) return null;
  return `Confidence ${confidence.toUpperCase()}`;
}

/** One-line typology description: area, bedrooms, bathrooms, price — skipping unknowns. */
export function formatUnitTypeSummary(unit: NewProjectUnitType): string {
  const parts = [
    formatArea(unit.builtAreaM2),
    formatBedrooms(unit.bedrooms, unit.bedrooms),
    formatBathrooms(unit.bathrooms),
    unit.priceFromCents != null
      ? `From ${formatPriceFromCents(unit.priceFromCents, unit.currency)}`
      : null,
  ].filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(" · ") : "Details not published";
}

/** Private area must never be collapsed into built area when both are known. */
export function formatUnitAreas(unit: NewProjectUnitType): string {
  const built = formatArea(unit.builtAreaM2);
  const priv = formatArea(unit.privateAreaM2);
  if (built && priv && built !== priv) return `${built} built · ${priv} private`;
  if (built) return `${built} built`;
  if (priv) return `${priv} private`;
  return NOT_PUBLISHED;
}
