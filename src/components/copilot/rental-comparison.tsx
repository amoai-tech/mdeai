"use client";

import { approvedExternalSourceUrl } from "@/lib/rentals/external-source";
import { formatListingMoney, type RentalResultRow } from "@/lib/rental-display";

/**
 * SAN-1041 — comparison consumes ONLY a previously returned, current authorized
 * rental result. The model (if added later) may select IDs, never supply facts.
 */
export type ComparisonRentalRow = RentalResultRow & {
  can_schedule_viewing?: boolean;
  photo_url?: string;
  image_url?: string;
  host_name?: string;
};

export function resolveRentalComparisonRows(
  rows: readonly ComparisonRentalRow[],
  listingIds: readonly string[],
): ComparisonRentalRow[] | null {
  if (listingIds.length < 2 || listingIds.length > 4 ||
      listingIds.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(listingIds).size !== listingIds.length) return null;

  // Resolve from these actual source rows only. A forged, missing, or stale ID
  // invalidates the whole proposed comparison; no partial/false-positive UI.
  const byId = new Map(rows.map((row) => [row.id, row]));
  const selected = listingIds.map((id) => byId.get(id));
  if (selected.some((row) => !row)) return null;
  return selected as ComparisonRentalRow[];
}

function ownCurrency(row: ComparisonRentalRow): string | null {
  const value = row.currency?.toUpperCase().trim();
  return value && /^[A-Z]{3}$/.test(value) ? value : null;
}

function exactPrice(row: ComparisonRentalRow, kind: "monthly" | "nightly"): string {
  const amount = kind === "monthly" ? row.price_monthly : row.nightly_price;
  const currency = ownCurrency(row);
  if (currency === null || typeof amount !== "number" ||
      !Number.isFinite(amount) || amount < 0) return "Not specified";
  return `${formatListingMoney(amount, currency)}/${kind === "monthly" ? "month" : "night"}`;
}

/** Never turn a nightly rate into an estimated monthly contract price. */
export function exactMonthlyRent(row: ComparisonRentalRow): string {
  return exactPrice(row, "monthly");
}

function bedrooms(row: ComparisonRentalRow): string {
  return row.bedrooms_unknown === true ||
    typeof row.bedrooms !== "number" ||
    !Number.isInteger(row.bedrooms) ||
    row.bedrooms < 0 ? "Not specified" : row.bedrooms === 0 ? "Studio" : String(row.bedrooms);
}

function listedAmenities(row: ComparisonRentalRow): string {
  const amenities = (Array.isArray(row.amenities) ? row.amenities : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 4);
  return amenities.length ? amenities.join(", ") : "Not specified";
}

export function RentalComparison({
  rows, listingIds, hasPin, onFocusPin, onOpenDetails, canOpenDetails, onScheduleViewing,
}: {
  rows: readonly ComparisonRentalRow[];
  listingIds: readonly string[];
  hasPin?: (id: string) => boolean;
  onFocusPin?: (id: string) => void;
  onOpenDetails?: (row: ComparisonRentalRow) => void;
  canOpenDetails?: (row: ComparisonRentalRow) => boolean;
  onScheduleViewing?: (row: ComparisonRentalRow) => void;
}) {
  const selected = resolveRentalComparisonRows(rows, listingIds);
  if (!selected) {
    return <p role="alert" className="text-sm text-muted-foreground">
      One or more apartments are not in these results. Select 2–4 current apartments.
    </p>;
  }

  return (
    <section data-testid="rental-comparison" className="w-full min-w-0 space-y-2">
      <p className="text-xs text-muted-foreground">
        Prices and amenities come from the listings. Unknown values stay unknown; nightly prices are not converted to monthly rent.
      </p>
      <div className="max-w-full overflow-x-auto rounded-md border" data-testid="rental-comparison-scroll" tabIndex={0}>
        <table aria-label="Apartment comparison" className="w-full min-w-[630px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th scope="col" className="min-w-28 p-3">Compare</th>
              {selected.map((row) => (
                <th key={row.id} scope="col" className="min-w-44 p-3">
                  <span className="block font-semibold">{row.title}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{row.neighborhood || "Location not specified"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([
              ["Monthly rent", exactMonthlyRent],
              ["Nightly rate", (row: ComparisonRentalRow) => exactPrice(row, "nightly")],
              ["Bedrooms", bedrooms],
              ["Wi-Fi", (row: ComparisonRentalRow) => row.wifi === true ? "Yes" : row.wifi === false ? "No" : "Not specified"],
              ["Listed amenities", listedAmenities],
            ] as Array<[string, (row: ComparisonRentalRow) => string]>).map(([label, display]) => (
              <tr key={label} className="border-b last:border-b-0">
                <th scope="row" className="p-3 align-top font-medium">{label}</th>
                {selected.map((row) => <td key={row.id} className="p-3 align-top">{display(row)}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row" className="p-3 align-top font-medium">Next steps</th>
              {selected.map((row) => {
                const original = row.tags?.includes("external-source")
                  ? approvedExternalSourceUrl(row.source_url) : null;
                return (
                  <td key={row.id} data-testid={`rental-comparison-column-${row.id}`} className="p-3 align-top">
                    <div className="flex flex-col gap-2">
                      {hasPin?.(row.id) && onFocusPin ? (
                        <button type="button" className="min-h-11 rounded-md border px-3 text-left" onClick={() => onFocusPin(row.id)}>
                          Focus on map
                        </button>
                      ) : null}
                      {onOpenDetails && (canOpenDetails?.(row) ?? true) ? (
                        <button type="button" className="min-h-11 rounded-md border px-3 text-left" onClick={() => onOpenDetails(row)}>
                          Details
                        </button>
                      ) : original ? (
                        <a href={original} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-md border px-3">
                          View original listing
                        </a>
                      ) : null}
                      {row.can_schedule_viewing === true && onScheduleViewing ? (
                        <button type="button" className="min-h-11 rounded-md border px-3 text-left" onClick={() => onScheduleViewing(row)}>
                          Schedule viewing
                        </button>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
