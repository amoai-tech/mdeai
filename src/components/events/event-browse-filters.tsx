"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import type { DateWindow, EventCategory } from "@/mastra/tools/search-events";

const DATE_WINDOWS: { value: DateWindow; label: string }[] = [
  { value: "tonight", label: "Tonight" },
  { value: "this_weekend", label: "This weekend" },
  { value: "this_week", label: "This week" },
  { value: "next_week", label: "Next week" },
  { value: "any", label: "Any date" },
];

const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: "music", label: "Music" },
  { value: "food", label: "Food" },
  { value: "culture", label: "Culture" },
  { value: "sport", label: "Sport" },
  { value: "nightlife", label: "Nightlife" },
];

const NEIGHBORHOODS = ["Laureles", "El Poblado", "Envigado", "Provenza"] as const;

const PRICES = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
] as const;

function buildFilterUrl(filters: {
  category?: EventCategory | null;
  neighborhood?: string | null;
  dateWindow?: DateWindow | null;
  price?: "free" | "paid" | null;
}): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.dateWindow && filters.dateWindow !== "any") {
    params.set("dateWindow", filters.dateWindow);
  }
  if (filters.price) params.set("price", filters.price);
  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

function toggleChip<T extends string>(current: T | null, value: T): T | null {
  return current === value ? null : value;
}

function toggleDateWindow(
  current: DateWindow | null,
  value: DateWindow,
): DateWindow | null {
  const active = current ?? "any";
  if (value === "any") return null;
  return active === value ? null : value;
}

const filterChipClass = cn(
  toggleVariants({ variant: "outline", size: "sm" }),
  "min-h-9 rounded-full px-3",
);
const activeChipClass = "border-primary bg-primary/10 text-primary";

/** One labelled chip row. Chips are navigation links, so the active one is `aria-current`, not `aria-pressed`. */
function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={`${label} filters`}
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
    >
      <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

type EventBrowseFiltersProps = {
  category: EventCategory | null;
  neighborhood: string | null;
  dateWindow: DateWindow | null;
  price: "free" | "paid" | null;
};

export function EventBrowseFilters({
  category,
  neighborhood,
  dateWindow,
  price,
}: EventBrowseFiltersProps) {
  const activeDateWindow = dateWindow ?? "any";
  const dateForUrl =
    activeDateWindow === "any" ? null : activeDateWindow;
  const moreId = useId();
  // Secondary filters collapse on phones only; an applied one keeps the panel open so it is never hidden.
  const hasSecondary = Boolean(neighborhood || price);
  const [moreOpen, setMoreOpen] = useState(hasSecondary);
  const showMore = moreOpen || hasSecondary;
  const hasAny = Boolean(category || hasSecondary || dateForUrl);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="events-filters">
      <FilterGroup label="Date">
        {DATE_WINDOWS.map(({ value, label }) => {
          const active = activeDateWindow === value;
          return (
            <Link
              key={value}
              href={buildFilterUrl({
                category,
                neighborhood,
                dateWindow: toggleDateWindow(dateWindow, value),
                price,
              })}
              aria-current={active ? "true" : undefined}
              data-testid={`events-filter-date-${value.replace(/_/g, "-")}`}
              className={cn(filterChipClass, active && activeChipClass)}
            >
              {label}
            </Link>
          );
        })}
      </FilterGroup>

      <FilterGroup label="Category">
        {CATEGORIES.map(({ value, label }) => {
          const active = category === value;
          return (
            <Link
              key={value}
              href={buildFilterUrl({
                category: toggleChip(category, value),
                neighborhood,
                dateWindow: dateForUrl,
                price,
              })}
              aria-current={active ? "true" : undefined}
              data-testid={`events-filter-category-${value}`}
              className={cn(filterChipClass, active && activeChipClass)}
            >
              {label}
            </Link>
          );
        })}
      </FilterGroup>

      {hasSecondary ? null : (
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          data-testid="events-filter-more"
          onClick={() => setMoreOpen((open) => !open)}
          className={cn(filterChipClass, "gap-1 sm:hidden")}
        >
          More filters
          <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden />
        </button>
      )}

      <div id={moreId} className={cn(showMore ? "flex" : "hidden", "w-full flex-col gap-2 sm:contents")}>
        <FilterGroup label="Neighborhood">
          {NEIGHBORHOODS.map((n) => {
            const active = neighborhood === n;
            return (
              <Link
                key={n}
                href={buildFilterUrl({
                  category,
                  neighborhood: toggleChip(neighborhood, n),
                  dateWindow: dateForUrl,
                  price,
                })}
                aria-current={active ? "true" : undefined}
                data-testid={`events-filter-neighborhood-${n.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(filterChipClass, active && activeChipClass)}
              >
                {n}
              </Link>
            );
          })}
        </FilterGroup>

        <FilterGroup label="Price">
          {PRICES.map(({ value, label }) => {
            const active = price === value;
            return (
              <Link
                key={value}
                href={buildFilterUrl({
                  category,
                  neighborhood,
                  dateWindow: dateForUrl,
                  price: toggleChip(price, value),
                })}
                aria-current={active ? "true" : undefined}
                data-testid={`events-filter-price-${value}`}
                className={cn(filterChipClass, active && activeChipClass)}
              >
                {label}
              </Link>
            );
          })}
        </FilterGroup>
      </div>

      {hasAny ? (
        <Link
          href="/events"
          data-testid="events-filter-clear"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
