"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { NumberField } from "@base-ui/react/number-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buildRentalsUrl } from "@/lib/rentals/browse-filters";
import { formatDateOnly, isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";

/**
 * SAN-1611 — pick dates on a real calendar, then decide.
 *
 * The URL stays the single owner of the applied dates: the calendar only ever edits a DRAFT.
 * Apply validates and navigates; Cancel, Close and Escape throw the draft away. Nothing here
 * reaches search, the map, the AI context or a booking until Apply.
 *
 * DATE CONTRACT (unchanged from the merged handoff): `from` is the first occupied day and
 * `through` is the last occupied day, both inclusive — Nov 10–15 is six days. The move-out date
 * is computed once, at the booking boundary, never here.
 */
export type SuggestedStay = { from: string; through?: string | null };

export function RentalDateSelector({
  neighborhood,
  beds,
  from,
  through,
  errorId,
  invalid = false,
  maxGuests,
  initialGuests,
  suggestedStay,
  onSuggestionHandled,
}: {
  neighborhood: string | null;
  beds: string | null;
  /** Applied dates, from the URL. Null when none are chosen. */
  from: string | null;
  through: string | null;
  errorId?: string;
  invalid?: boolean;
  /** Only a genuine, source-backed capacity may render a guest control. */
  maxGuests?: number | null;
  initialGuests?: number;
  /** An AI-suggested stay: opens the draft, never applies it. */
  suggestedStay?: SuggestedStay | null;
  onSuggestionHandled?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [handledSuggestionKey, setHandledSuggestionKey] = useState<string | null>(null);

  const applied = { from: toLocalDate(from), to: toLocalDate(through) };

  // Opening always starts from what is actually applied, never from a stale draft.
  const openWithApplied = () => {
    setDraft(applied.from || applied.to ? applied : undefined);
    setError(null);
  };

  const cancel = () => {
    setDraft(undefined);
    setError(null);
  };

  // An AI suggestion is a DRAFT: it opens the calendar, the renter still has to Apply.
  // Adjusting state during render (React's documented "derive from props" pattern) is used
  // instead of an effect, which would cause a second render pass and is lint-blocked here.
  const suggestionKey = suggestedStay
    ? `${suggestedStay.from}|${suggestedStay.through ?? ""}`
    : null;
  if (suggestionKey && suggestionKey !== handledSuggestionKey) {
    const next = {
      from: toLocalDate(suggestedStay!.from),
      to: toLocalDate(suggestedStay!.through ?? null),
    };
    setHandledSuggestionKey(suggestionKey);
    if (next.from) {
      setDraft(next);
      setError(null);
      setOpen(true);
    }
  }

  // Tell the owner the suggestion has been consumed so it can clear it. No local state here.
  useEffect(() => {
    if (suggestionKey) onSuggestionHandled?.();
  }, [suggestionKey, onSuggestionHandled]);

  const apply = () => {
    const nextFrom = draft?.from ? toIsoDate(draft.from) : null;
    const nextThrough = draft?.to ? toIsoDate(draft.to) : null;
    if (nextFrom && !isRealCalendarDate(nextFrom)) {
      setError("Choose a real calendar date.");
      return;
    }
    if (nextFrom && nextThrough && !isOrderedStay(nextFrom, nextThrough)) {
      setError("The stay can’t end before it starts.");
      return;
    }
    router.push(buildRentalsUrl({ neighborhood, beds, from: nextFrom, through: nextThrough }));
    setOpen(false);
  };

  const clear = () => {
    router.push(buildRentalsUrl({ neighborhood, beds }));
    setOpen(false);
  };

  const label = from
    ? `${formatDateOnly(from)}${through ? ` – ${formatDateOnly(through)}` : ""}`
    : "Any dates";
  const guestsAvailable = typeof maxGuests === "number" && Number.isFinite(maxGuests) && maxGuests >= 1;

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Stay dates</p>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) openWithApplied();
          else cancel();
        }}
      >
        <DialogTrigger
          data-testid="rentals-dates-trigger"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-11 min-h-11 gap-2 font-normal")}
        >
          <CalendarDays className="size-4" aria-hidden />
          {label}
        </DialogTrigger>

        <DialogContent data-testid="rentals-dates-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose your stay</DialogTitle>
            <DialogDescription>
              Pick the first and last day you’ll be there, then apply. Nothing is booked or charged.
            </DialogDescription>
          </DialogHeader>

          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={draft}
            onSelect={(next) => {
              setDraft(next);
              setError(null);
            }}
            autoFocus
          />

          <p className="text-xs text-muted-foreground" data-testid="rentals-dates-summary">
            {draft?.from
              ? `${formatDateOnly(toIsoDate(draft.from))}${
                  draft.to ? ` – ${formatDateOnly(toIsoDate(draft.to))}` : " · pick the last day"
                }`
              : "No dates selected"}
          </p>

          {guestsAvailable ? (
            <GuestCount max={maxGuests as number} initial={initialGuests ?? 1} />
          ) : null}

          {error ? (
            <p role="alert" data-testid="rentals-dates-dialog-error" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            {from || through ? (
              <Button type="button" variant="ghost" onClick={clear} data-testid="rentals-dates-clear" className="h-11 min-h-11">
                Clear dates
              </Button>
            ) : null}
            <DialogClose render={<Button type="button" variant="outline" data-testid="rentals-dates-cancel" className="h-11 min-h-11" />}>
              Cancel
            </DialogClose>
            <Button type="button" onClick={apply} data-testid="rentals-dates-apply" className="h-11 min-h-11">
              Apply dates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * A guest count is only ever shown for an apartment whose stored capacity is known. MDE has no
 * sourced capacity column today, so this renders nowhere in production — which is the honest
 * outcome. It is deliberately not a booking field: the API has no guest contract.
 */
function GuestCount({ max, initial }: { max: number; initial: number }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm">
        Guests
      </label>
      <NumberField.Root min={1} max={max} defaultValue={Math.min(Math.max(initial, 1), max)}>
        <NumberField.Group className="flex items-center gap-1" data-testid="rental-date-guests">
          <NumberField.Decrement className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            −
          </NumberField.Decrement>
          <NumberField.Input id={id} className="w-10 rounded-md border border-border text-center text-sm" />
          <NumberField.Increment className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            +
          </NumberField.Increment>
        </NumberField.Group>
      </NumberField.Root>
    </div>
  );
}

/** ISO `YYYY-MM-DD` → a Date at LOCAL midnight. DayPicker works in local time. */
function toLocalDate(iso: string | null): Date | undefined {
  if (!iso || !isRealCalendarDate(iso)) return undefined;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** A selected calendar day → `YYYY-MM-DD` from its LOCAL components, never via UTC. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
