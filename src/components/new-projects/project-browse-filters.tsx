"use client";

import Link from "next/link";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import {
  BED_OPTIONS,
  DELIVERY_OPTIONS,
  MAX_PRICE_OPTIONS,
  NEIGHBORHOOD_OPTIONS,
  buildNewProjectsHref,
  countActiveFilters,
} from "@/lib/new-projects/filters";
import type { NewProjectFilters } from "@/lib/new-projects/types";

function chipClass(active: boolean): string {
  return cn(
    toggleVariants({ variant: "outline", size: "sm" }),
    "min-h-9 rounded-full px-3",
    active && "border-primary bg-primary/10 text-primary",
  );
}

function neighborhoodSlug(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

/**
 * URL-driven filters, modelled on the rental browse filters. Each chip is a link so the
 * filter state is shareable and survives a refresh; toggling recalculates the query string.
 */
export function ProjectBrowseFilters({ filters }: { filters: NewProjectFilters }) {
  const activeCount = countActiveFilters(filters);

  return (
    <>
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Neighborhood</p>
        <div role="group" aria-label="Neighborhood filters" className="flex flex-wrap gap-2">
          {NEIGHBORHOOD_OPTIONS.map((option) => {
            const active = filters.neighborhood === option;
            const next: NewProjectFilters = {
              ...filters,
              neighborhood: active ? null : option,
            };
            return (
              <Link
                key={option}
                href={buildNewProjectsHref(next)}
                aria-pressed={active}
                data-testid={"new-projects-filter-neighborhood-" + neighborhoodSlug(option)}
                className={chipClass(active)}
              >
                {option}
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Bedrooms</p>
        <div role="group" aria-label="Bedroom filters" className="flex flex-wrap gap-2">
          {BED_OPTIONS.map((option) => {
            const active = filters.minBedrooms === Number(option.value);
            const next: NewProjectFilters = {
              ...filters,
              minBedrooms: active ? null : Number(option.value),
            };
            return (
              <Link
                key={option.value}
                href={buildNewProjectsHref(next)}
                aria-pressed={active}
                data-testid={"new-projects-filter-beds-" + option.value}
                className={chipClass(active)}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Max price-from (COP)</p>
        <div role="group" aria-label="Price filters" className="flex flex-wrap gap-2">
          {MAX_PRICE_OPTIONS.map((option) => {
            const active = filters.maxPriceCop === Number(option.value);
            const next: NewProjectFilters = {
              ...filters,
              maxPriceCop: active ? null : Number(option.value),
            };
            return (
              <Link
                key={option.value}
                href={buildNewProjectsHref(next)}
                aria-pressed={active}
                data-testid={"new-projects-filter-price-" + option.value}
                className={chipClass(active)}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Delivery</p>
        <div role="group" aria-label="Delivery filters" className="flex flex-wrap gap-2">
          {DELIVERY_OPTIONS.map((option) => {
            const active =
              option.value === "unknown"
                ? filters.deliveryUnknown
                : filters.deliveryYear === Number(option.value);
            const next: NewProjectFilters =
              option.value === "unknown"
                ? {
                    ...filters,
                    deliveryYear: null,
                    deliveryUnknown: active ? false : true,
                  }
                : {
                    ...filters,
                    deliveryUnknown: false,
                    deliveryYear: active ? null : Number(option.value),
                  };
            return (
              <Link
                key={option.value}
                href={buildNewProjectsHref(next)}
                aria-pressed={active}
                data-testid={"new-projects-filter-delivery-" + option.value}
                className={chipClass(active)}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </div>

      {activeCount > 0 ? (
        <div>
          <Link
            href="/new-projects"
            data-testid="new-projects-filter-clear"
            className="text-xs text-primary hover:underline"
          >
            Clear all filters ({activeCount})
          </Link>
        </div>
      ) : null}
    </>
  );
}
