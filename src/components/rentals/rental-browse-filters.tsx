"use client";

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDateOnly } from "@/lib/rentals/date-only";
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
  "min-h-11 rounded-full px-3 lg:min-h-9",
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
      {neighborhood || beds || from || through || dateError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-foreground">Active filters</span>
          <Link href={buildRentalsUrl({})} data-testid="rentals-clear-filters" className={cn(chip, "min-h-card-action text-primary")}>Clear filters</Link>
        </div>
      ) : null}
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

/** Mobile-only presentation of the existing filters; URL remains the owner.
 * Native links apply immediately; the stay calendar still requires its own Apply. */
export function RentalMobileFilters(props: RentalBrowseFiltersProps) {
  const [open, setOpen] = useState(false);
  const [lastSuggestion, setLastSuggestion] = useState(props.suggestedStay);
  // AI date suggestions still reach the existing calendar, including when the drawer is closed.
  if (props.suggestedStay !== lastSuggestion) {
    setLastSuggestion(props.suggestedStay);
    if (props.suggestedStay) setOpen(true);
  }
  const { neighborhood, beds, from, through, dateError } = props;
  const labels = [
    neighborhood,
    BEDS.find((option) => option.value === beds)?.label,
    dateError ? "Check dates" : from && through
      ? formatDateOnly(from) + " – " + formatDateOnly(through)
      : from ? "From " + formatDateOnly(from)
      : through ? "Through " + formatDateOnly(through) : null,
  ].filter((value): value is string => Boolean(value));
  const showSheet = open || Boolean(props.suggestedStay);
  return (
    <Sheet open={showSheet} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center gap-2">
        <SheetTrigger render={<Button type="button" variant="outline" size="sm" className="min-h-11 gap-2"
          data-testid="rentals-mobile-filters-trigger" />}>
          <SlidersHorizontal className="size-4" aria-hidden /> Filters{labels.length > 0 ? " (" + labels.length + ")" : ""}
        </SheetTrigger>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" aria-label="Applied filters" data-testid="rentals-active-filter-chips">
          {labels.map((label, i) => <span key={i} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium break-words">{label}</span>)}
        </div>
      </div>
      <SheetContent side="bottom" showCloseButton={false}
        className="max-h-[90dvh] gap-3 rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        data-testid="rentals-mobile-filter-sheet">
        <SheetHeader className="p-0">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Choose your neighborhood, bedrooms and stay dates.</SheetDescription>
        </SheetHeader>
        <div data-testid="workspace-filters" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain">
          <RentalBrowseFilters {...props} />
        </div>
        <SheetClose render={<Button className="min-h-11 w-full shrink-0" />}>Show apartments</SheetClose>
      </SheetContent>
    </Sheet>
  );
}
