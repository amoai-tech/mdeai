export const COMPARISON_TABLE_TARGET = "chat";
export const COMPARISON_TABLE_SURFACE_ID = "comparison-table";
const A2UI_VERSION = "1.0";
const MAX_ROWS = 5;

export type ComparisonRow = {
  id: string;
  title: string;
  bedrooms: number | null;
  price: number | null;
  currency: string | null;
  period: "month" | "night" | null;
};

export type ComparisonTableOps = {
  target: string;
  operations: Array<Record<string, unknown>>;
};

function priceLabel(row: ComparisonRow): string {
  if (row.price == null || !Number.isFinite(row.price)) return "Not recorded";
  if (!row.currency) return String(row.price);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: row.currency,
      currencyDisplay: "code",
      maximumFractionDigits: 0,
    }).format(row.price).replace(/\u00a0/g, " ");
  } catch {
    return `${row.currency} ${row.price.toLocaleString("en-US")}`;
  }
}

function periodLabel(period: ComparisonRow["period"]): string {
  return period === "month" ? "month" : period === "night" ? "night" : "";
}

/**
 * Builds the official Column → Table surface. Table must be a child of a plain
 * Column, never a Card. Prices and bedrooms come from verified tool rows; this
 * function never converts a monthly rent to a nightly rate.
 */
export function buildComparisonTableOps(
  rows: readonly ComparisonRow[],
  surfaceId: string = COMPARISON_TABLE_SURFACE_ID,
  options: { replace?: boolean } = {},
): ComparisonTableOps | null {
  const safe = rows.slice(0, MAX_ROWS);
  if (safe.length < 2) return null;
  const allMonthly = safe.every((row) => row.period === "month");
  const allNightly = safe.every((row) => row.period === "night");
  const columns = allMonthly
    ? ["Apartment", "Bedrooms", "Monthly Price", "Currency"]
    : allNightly
      ? ["Apartment", "Bedrooms", "Nightly Price", "Currency"]
      : ["Apartment", "Bedrooms", "Price", "Currency / Period"];
  const cells = safe.map((row) => [
    row.title,
    row.bedrooms == null ? "Not recorded" : row.bedrooms,
    priceLabel(row),
    allMonthly || allNightly
      ? row.currency ?? "Not recorded"
      : row.price == null || !row.currency
        ? `Not recorded${periodLabel(row.period) ? ` / ${periodLabel(row.period)}` : ""}`
        : `${row.currency} / ${periodLabel(row.period)}`.trim(),
  ]);
  return {
    target: COMPARISON_TABLE_TARGET,
    operations: [
      ...(options.replace ? [{ version: A2UI_VERSION, deleteSurface: { surfaceId } }] : []),
      {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId,
        components: [
          { id: "root", component: "Column", children: ["comparison"] },
          {
            id: "comparison",
            component: "Table",
            caption: "Apartment comparison",
            columns,
            rows: cells,
          },
        ],
      },
      },
    ],
  };
}
