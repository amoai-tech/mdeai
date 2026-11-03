"use client";

import { useId } from "react";
import Link from "next/link";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { buildRentalsUrl } from "@/lib/rentals/browse-filters";
import { RentalDateSelector, type SuggestedStay } from "@/components/rentals/rental-date-selector";

const NEIGHBORHOODS = [
  "Laureles",
  "El Poblado",
  "Envigado",
  "Sabaneta",
  "Belén",
] as const;

const BEDS = [
  { value: "0", label: "Studio" },
  { value: "1", label: "1 BR" },
  { value: "2", label: "2 BR" },
  { value: "3", label: "3 BR+" },
] as const;

function toggle(current: string | null, value: string): string | null {
  return current === value ? null : value;
}

const chip = cn(
  toggleVariants({ variant: "outline", size: "sm" }),
  "min-h-9 rounded-full px-3",
);

type RentalBrowseFiltersProps = {
  neighborhood: string | null;
  beds: string | null;
  /** Stay dates (SAN-486): first day and last day, both inclusive, `YYYY-MM-DD`. */
  from?: string | null;
  through?: string | null;
  /** Why the dates were refused, or null. */
  dateError?: string | null;
  /** SAN-1611 — an AI-proposed stay, shown as a draft the renter must still apply. */
  suggestedStay?: SuggestedStay | null;
  onSuggestionHandled?: () => void;
};

export function RentalBrowseFilters({
  neighborhood,
  beds,
  from = null,
  through = null,
  dateError = null,
  suggestedStay = null,
  onSuggestionHandled,
}: RentalBrowseFiltersProps) {
  // The filter bar is rendered once per layout (desktop and mobile), so the error id must be unique.
  const errorId = useId();
  return (
    <>
      {/* Neighborhood */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Neighborhood
        </p>
        <div
          role="group"
          aria-label="Neighborhood filters"
          className="flex flex-wrap gap-2"
        >
          {NEIGHBORHOODS.map((n) => {
            const active = neighborhood === n;
            return (
              <Link
                key={n}
                href={buildRentalsUrl({
                  neighborhood: toggle(neighborhood, n),
                  beds,
                  from,
                  through,
                })}
                aria-current={active ? "true" : undefined}
                data-testid={`rentals-filter-neighborhood-${n.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  chip,
                  active && "border-primary bg-primary/5 text-primary",
                )}
              >
                {n}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bedrooms */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Bedrooms
        </p>
        <div
          role="group"
          aria-label="Bedroom filters"
          className="flex flex-wrap gap-2"
        >
          {BEDS.map(({ value, label }) => {
            const active = beds === value;
            return (
              <Link
                key={value}
                href={buildRentalsUrl({
                  neighborhood,
                  beds: toggle(beds, value),
                  from,
                  through,
                })}
                aria-current={active ? "true" : undefined}
                data-testid={`rentals-filter-beds-${value}`}
                className={cn(
                  chip,
                  active && "border-primary bg-primary/5 text-primary",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* SAN-1611 — the calendar owns a draft; only Apply commits to the URL. */}
      <RentalDateSelector
        neighborhood={neighborhood}
        beds={beds}
        from={from}
        through={through}
        errorId={errorId}
        invalid={Boolean(dateError)}
        suggestedStay={suggestedStay}
        onSuggestionHandled={onSuggestionHandled}
      />
      {dateError ? (
        <p id={errorId} role="alert" data-testid="rentals-date-error" className="mt-2 text-xs text-destructive">
          {dateError}
        </p>
      ) : null}
    </>
  );
}
