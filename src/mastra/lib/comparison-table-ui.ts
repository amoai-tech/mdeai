/** A2UI v1.0 data-form Table. The server owns the facts and the layout. */
export const COMPARISON_TABLE_TARGET = "chat";
export const RENTAL_COMPARISON_TARGET = "rental-comparison";
export type ComparisonTarget = typeof COMPARISON_TABLE_TARGET | typeof RENTAL_COMPARISON_TARGET;
export const COMPARISON_TABLE_SURFACE_ID = "comparison-table";
const A2UI_VERSION = "1.0";
const MAX_APARTMENTS = 5;

export type ComparisonRow = {
  id: string;
  title: string;
  neighborhood: string | null;
  bedrooms: number | null;
  furnished: boolean | null;
  bathrooms: number | null;
  sizeSqm: number | null;
  wifiSpeedMbps: number | null;
  amenities: string[];
  priceMonthly: number | null;
  priceNightly: number | null;
  currency: string | null;
};

export type ComparisonTableOps = {
  target: string;
  operations: Array<Record<string, unknown>>;
};

function money(value: number | null, currency: string | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Not recorded";
  if (!currency) return `${value.toLocaleString("en-US")} (currency not recorded)`;
  try {
    // Preserve a recorded fractional rate. A blanket zero-digit formatter
    // made USD 99.50 and USD 99.60 both look like USD 100, even though the
    // sourced amounts (and price ranking) differ. Integer COP stays integer.
    const currencyDigits = new Intl.NumberFormat("en-US", { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits ?? 2;
    const recordedDigits = String(value).split(".")[1]?.length ?? 0;
    const precision = Number.isInteger(value) ? 0 : Math.min(20, Math.max(currencyDigits, recordedDigits));
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(value).replace(/\u00a0/g, " ");
  } catch {
    return `${currency} ${value.toLocaleString("en-US")}`;
  }
}

function numberLabel(value: number | null): string {
  return value == null || !Number.isFinite(value) || value < 0
    ? "Not recorded"
    : String(value);
}

function sizeLabel(value: number | null): string {
  return value == null || !Number.isFinite(value) || value <= 0
    ? "Not recorded"
    : `${value.toLocaleString("en-US")} m²`;
}

function wifiLabel(value: number | null): string {
  return value == null || !Number.isFinite(value) || value <= 0
    ? "Not recorded"
    : `${value.toLocaleString("en-US")} Mbps (listed)`;
}

function amenitiesLabel(amenities: readonly string[]): string {
  const valid = [...new Set(amenities.filter((a) => typeof a === "string" && a.trim()).map((a) => a.trim()))];
  if (!valid.length) return "Not recorded";
  return valid.length > 4
    ? `${valid.slice(0, 4).join(", ")} (+${valid.length - 4} more)`
    : valid.join(", ");
}

/** Lowest *listed* price, only when every apartment has a comparable rate/currency. */
export function comparablePriceSummary(rows: readonly ComparisonRow[]): string {
  const choose = (period: "priceMonthly" | "priceNightly", label: string) => {
    const candidates = rows.filter((row) =>
      row[period] != null && Number.isFinite(row[period]) && (row[period] as number) > 0 && row.currency,
    );
    if (candidates.length !== rows.length || new Set(candidates.map((row) => row.currency)).size !== 1) return null;
    const cheapest = candidates.reduce((best, row) => (row[period] as number) < (best[period] as number) ? row : best);
    if (candidates.every((row) => row[period] === cheapest[period])) return null;
    const amounts = candidates.map((candidate) => candidate[period] as number);
    const precision = Math.min(12, Math.max(...amounts.map((amount) => String(amount).split(".")[1]?.length ?? 0)));
    const difference = amounts.length === 2
      ? Number(Math.abs(amounts[0] - amounts[1]).toFixed(precision)) : null;
    const savings = difference ? ` — ${money(difference, cheapest.currency)} less` : "";
    return `Lowest listed ${label}: ${cheapest.title} at ${money(cheapest[period], cheapest.currency)}${savings} (not an overall recommendation).`;
  };
  return choose("priceMonthly", "monthly rent")
    ?? choose("priceNightly", "nightly rent")
    ?? "Compare recorded facts; missing values and different currencies or rental periods are not directly comparable.";
}

/** Apartments are COLUMNS and facts are ROWS, so a renter can scan across options. */
export function buildComparisonTableOps(
  rows: readonly ComparisonRow[],
  surfaceId: string = COMPARISON_TABLE_SURFACE_ID,
  options: { replace?: boolean; target?: ComparisonTarget } = {},
): ComparisonTableOps | null {
  const safe = rows.slice(0, MAX_APARTMENTS);
  if (safe.length < 2) return null;
  const rentalPage = options.target === RENTAL_COMPARISON_TARGET;
  const columns = ["Feature", ...safe.map((row, index) => rentalPage ? `Option #${index + 1}\n${row.title}` : row.title)];
  const metricRows: Array<[string, (row: ComparisonRow) => string | number]> = [
    ["Monthly rent", (row) => money(row.priceMonthly, row.currency)],
    ["Nightly rent", (row) => money(row.priceNightly, row.currency)],
    ["Neighborhood", (row) => row.neighborhood?.trim() || "Not recorded"],
    ["Bedrooms", (row) => numberLabel(row.bedrooms)],
    ["Furnished", (row) => row.furnished === true ? "Yes" : row.furnished === false ? "No" : "Not recorded"],
    ["Bathrooms", (row) => numberLabel(row.bathrooms)],
    ["Area", (row) => sizeLabel(row.sizeSqm)],
    ["Wi-Fi speed", (row) => wifiLabel(row.wifiSpeedMbps)],
    ["Amenities", (row) => amenitiesLabel(row.amenities)],
  ];
  const tableRows = metricRows.map(([feature, get]) => [feature, ...safe.map(get)])
    // Hide entirely unknown features only in the focused Rentals comparison.
    // Keep partial rows and both real rental periods; never infer missing rates.
    .filter((row) => !rentalPage || row.slice(1).some((value) => value !== "Not recorded"));
  return {
    target: options.target ?? COMPARISON_TABLE_TARGET,
    operations: [
      ...(options.replace ? [{ version: A2UI_VERSION, deleteSurface: { surfaceId } }] : []),
      {
        version: A2UI_VERSION,
        createSurface: {
          surfaceId,
          components: [
            {
              id: "root", component: "Column",
              children: ["comparison-heading", "comparison", "comparison-summary", "comparison-note", "comparison-actions"],
            },
            { id: "comparison-heading", component: "Row", children: ["comparison-title", "comparison-badge"] },
            { id: "comparison-title", component: "Title", text: `Compare ${safe.length} apartments`, size: "lg" },
            { id: "comparison-badge", component: "Badge", label: "Recorded details" },
            {
              id: "comparison",
              component: "Table",
              caption: "Side-by-side apartment comparison (recorded listing facts)",
              columns,
              rows: tableRows,
            },
            { id: "comparison-summary", component: "Text", text: comparablePriceSummary(safe) },
            {
              id: "comparison-note", component: "Caption",
              text: 'Prices are listing rates, not confirmed availability. Monthly and nightly rates are different; "Not recorded" means the listing does not provide that detail.',
            },
            // The Rentals page uses only official Standard Catalog components.
            // Chat keeps the existing action adapter until that surface gains
            // its own page-scoped handlers; never add dead buttons to chat.
            ...(options.target === RENTAL_COMPARISON_TARGET
              ? [
                  { id: "comparison-actions", component: "Grid", columns: 2, gap: 2,
                    children: safe.map((_, index) => `comparison-action-${index}`) },
                  ...safe.flatMap((row, index) => [
                    { id: `comparison-action-${index}`, component: "Column", gap: 1,
                      children: [`comparison-action-title-${index}`, `comparison-action-buttons-${index}`] },
                    { id: `comparison-action-title-${index}`, component: "Text", text: `Option #${index + 1}` },
                    { id: `comparison-action-buttons-${index}`, component: "Row", wrap: "wrap", gap: 2,
                      children: [`comparison-details-${index}`, `comparison-view-${index}`] },
                    { id: `comparison-details-${index}`, component: "Button", label: "Details", size: "md",
                      onClick: { functionCall: { "@call": "openComparedRentalDetails", args: { listingId: row.id } } } },
                    { id: `comparison-view-${index}`, component: "Button", label: "Schedule viewing", size: "md",
                      onClick: { functionCall: { "@call": "requestComparedRentalViewing", args: { listingId: row.id } } } },
                  ]),
                ]
              : [{ id: "comparison-actions", component: "RentalComparisonActions", listingIds: safe.map((row) => row.id) }]),
          ],
        },
      },
    ],
  };
}
