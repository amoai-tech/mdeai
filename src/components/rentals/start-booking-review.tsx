"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * SAN-481 — start a booking review.
 *
 * The idempotency key is generated once, on the renter's first submit, and reused for every
 * retry of that same review: a double-click, a slow network or a refresh-then-retry resumes
 * the same pending booking instead of creating a second one. A date change starts a
 * separate intentional request; the server rejects reuse of a key with different data.
 */
/**
 * Persist one key for the same apartment/stay across a full refresh in this browser tab.
 * The stay is part of the key: the server answers 409 when one key is reused for different
 * dates, so changing a date must start a genuinely new intent rather than collide.
 */
function bookingKeyFor(apartmentId: string, stay: string): string {
  const newKey = () => `bi-${crypto.randomUUID()}`;
  try {
    const storageKey = `mde:booking-intent:${apartmentId}:${stay}`;
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored && /^bi-[0-9a-f-]{36}$/.test(stored)) return stored;
    const key = newKey();
    window.sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    // Private-storage restrictions do not prevent a booking; in-memory retries still work.
    return newKey();
  }
}

export function StartBookingReview({
  apartmentId,
  defaultStartDate,
  defaultEndDate,
  onDatesChange,
}: {
  apartmentId: string;
  defaultStartDate?: string | null;
  defaultEndDate?: string | null;
  /** SAN-1611: lets the review summary show the same dates the renter is editing. */
  onDatesChange?: (start: string, end: string) => void;
}) {
  const router = useRouter();
  const currentAttempt = useRef<{ stay: string; key: string } | null>(null);
  const [startDate, setStartDate] = useState(defaultStartDate ?? "");
  // A move-out is only shown when the renter actually chose a range on /rentals.
  const [endDate, setEndDate] = useState(defaultEndDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const stay = `${startDate}|${endDate}`;
    if (!currentAttempt.current || currentAttempt.current.stay !== stay) {
      currentAttempt.current = { stay, key: bookingKeyFor(apartmentId, `${startDate}_${endDate || "open"}`) };
    }
    const idempotencyKey = currentAttempt.current.key;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rentals/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId,
          startDate,
          ...(endDate ? { endDate } : {}),
          idempotencyKey,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        booking?: { id?: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.booking?.id) {
        setError(body.error?.message ?? "We couldn’t save your booking review. Please try again.");
        return;
      }
      router.push(`/rentals/bookings/${body.booking.id}`);
    } catch {
      // Keep the same key: a retry resumes this booking instead of creating another.
      setError("Network error — please retry. This will not create a second booking.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3" data-testid="booking-start-form">
      <label className="block text-sm">
        <span className="text-muted-foreground">Move-in date</span>
        <input
          type="date"
          required
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
            onDatesChange?.(event.target.value, endDate);
          }}
          data-testid="booking-start-date"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      {defaultEndDate ? (
        <label className="block text-sm">
          <span className="text-muted-foreground">Move-out date</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => {
              setEndDate(event.target.value);
              onDatesChange?.(startDate, event.target.value);
            }}
            data-testid="booking-start-end-date"
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy || !startDate} data-testid="booking-start-submit">
        {busy ? "Saving…" : "Start booking review"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert" data-testid="booking-start-error">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        No payment is taken now. You review the dates and price first, and only then can a
        card payment be started.
      </p>
    </form>
  );
}
