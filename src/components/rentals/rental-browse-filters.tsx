"use client";

import { useId } from "react";
import Link from "next/link";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { buildRentalsUrl } from "@/lib/rentals/browse-filters";

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
};

const dateInput =
  "mt-1 min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground";

export function RentalBrowseFilters({
  neighborhood,
  beds,
  from = null,
  through = null,
  dateError = null,
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
                aria-pressed={active}
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
                aria-pressed={active}
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

      {/* Stay dates (SAN-486): a plain GET form, so it works without JavaScript, survives refresh and
          Back, and keeps the other filters through hidden fields. */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Stay dates</p>
        <form
          key={`${from ?? ""}|${through ?? ""}`}
          method="get"
          action="/rentals"
          data-testid="rentals-date-form"
          className="flex flex-wrap items-end gap-2"
        >
          {neighborhood ? <input type="hidden" name="neighborhood" value={neighborhood} /> : null}
          {beds ? <input type="hidden" name="beds" value={beds} /> : null}
          <label className="flex flex-col text-xs text-muted-foreground">
            From
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              data-testid="rentals-date-from"
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? errorId : undefined}
              className={dateInput}
            />
          </label>
          <label className="flex flex-col text-xs text-muted-foreground">
            Through
            <input
              type="date"
              name="through"
              defaultValue={through ?? ""}
              data-testid="rentals-date-through"
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? errorId : undefined}
              className={dateInput}
            />
          </label>
          <button
            type="submit"
            data-testid="rentals-dates-apply"
            className={cn(chip, "min-h-11 border-primary bg-primary/5 px-4 text-primary")}
          >
            Apply dates
          </button>
          {from || through || dateError ? (
            <Link
              href={buildRentalsUrl({ neighborhood, beds })}
              data-testid="rentals-dates-clear"
              className="min-h-11 content-center text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear dates
            </Link>
          ) : null}
        </form>
        {dateError ? (
          <p id={errorId} role="alert" data-testid="rentals-date-error" className="mt-2 text-xs text-destructive">
            {dateError}
          </p>
        ) : null}
      </div>
    </>
  );
}
