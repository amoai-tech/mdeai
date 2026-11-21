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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: 0,
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
    return `Lowest listed ${label}: ${cheapest.title} at ${money(cheapest[period], cheapest.currency)}. This is a price comparison, not an overall recommendation.`;
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
  const columns = ["Feature", ...safe.map((row) => row.title)];
  const metricRows: Array<[string, (row: ComparisonRow) => string | number]> = [
    ["Neighborhood", (row) => row.neighborhood?.trim() || "Not recorded"],
    ["Bedrooms", (row) => numberLabel(row.bedrooms)],
    ["Bathrooms", (row) => numberLabel(row.bathrooms)],
    ["Area", (row) => sizeLabel(row.sizeSqm)],
    ["Monthly rent", (row) => money(row.priceMonthly, row.currency)],
    ["Nightly rent", (row) => money(row.priceNightly, row.currency)],
    ["Wi-Fi speed", (row) => wifiLabel(row.wifiSpeedMbps)],
    ["Amenities", (row) => amenitiesLabel(row.amenities)],
  ];
  const tableRows = metricRows.map(([feature, get]) => [feature, ...safe.map(get)]);
  return {
    target: options.target ?? COMPARISON_TABLE_TARGET,
    operations: [
      ...(options.replace ? [{ version: A2UI_VERSION, deleteSurface: { surfaceId } }] : []),
      {
        version: A2UI_VERSION,
        createSurface: {
          surfaceId,
          components: [
            { id: "root", component: "Column", children: ["comparison", "comparison-summary", "comparison-actions"] },
            {
              id: "comparison",
              component: "Table",
              caption: "Side-by-side apartment comparison (recorded listing facts)",
              columns,
              rows: tableRows,
            },
            { id: "comparison-summary", component: "Text", text: comparablePriceSummary(safe) },
            { id: "comparison-actions", component: "RentalComparisonActions", listingIds: safe.map((row) => row.id) },
          ],
        },
      },
    ],
  };
}
