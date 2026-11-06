"use client";

import Link from "next/link";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { ClearFiltersLink } from "@/components/browse/clear-filters-link";

const NEIGHBORHOODS = ["Laureles", "El Poblado", "Envigado", "Sabaneta"] as const;

const CUISINES = [
  { value: "paisa", label: "Paisa" },
  { value: "colombian", label: "Colombian" },
  { value: "cafe", label: "Café" },
  { value: "seafood", label: "Seafood" },
  { value: "steakhouse", label: "Steakhouse" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "international", label: "International" },
  { value: "street-food", label: "Street food" },
] as const;

function buildFilterUrl(filters: {
  neighborhood?: string | null;
  cuisine?: string | null;
}): string {
  const params = new URLSearchParams();
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.cuisine) params.set("cuisine", filters.cuisine);
  const query = params.toString();
  return query ? `/restaurants?${query}` : "/restaurants";
}

function toggleNeighborhood(current: string | null, value: string): string | null {
  return current === value ? null : value;
}

function toggleCuisine(current: string | null, value: string): string | null {
  return current === value ? null : value;
}

const filterChipClass = cn(
  toggleVariants({ variant: "outline", size: "sm" }),
  "min-h-11 rounded-full px-3 lg:min-h-9",
);

type RestaurantBrowseFiltersProps = {
  neighborhood: string | null;
  cuisine: string | null;
};

export function RestaurantBrowseFilters({
  neighborhood,
  cuisine,
}: RestaurantBrowseFiltersProps) {
  return (
    <>
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
                href={buildFilterUrl({
                  neighborhood: toggleNeighborhood(neighborhood, n),
                  cuisine,
                })}
                aria-current={active ? "true" : undefined}
                data-testid={`restaurants-filter-neighborhood-${n.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  filterChipClass,
                  active && "border-primary bg-primary/10 text-primary",
                )}
              >
                {n}
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Cuisine</p>
        <div
          role="group"
          aria-label="Cuisine filters"
          className="flex flex-wrap gap-2"
        >
          {CUISINES.map(({ value, label }) => {
            const active = cuisine === value;
            return (
              <Link
                key={value}
                href={buildFilterUrl({
                  neighborhood,
                  cuisine: toggleCuisine(cuisine, value),
                })}
                aria-current={active ? "true" : undefined}
                data-testid={`restaurants-filter-cuisine-${value}`}
                className={cn(
                  filterChipClass,
                  active && "border-primary bg-primary/10 text-primary",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      {neighborhood || cuisine ? (
        <ClearFiltersLink href={buildFilterUrl({})} testId="restaurants-filter-clear" />
      ) : null}
    </>
  );
}
