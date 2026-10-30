"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * SAN-481 — start a booking review.
 *
 * The idempotency key is generated once, on the renter's first submit, and reused for every
 * retry of that same review: a double-click, a slow network or a refresh-then-retry resumes
 * the same pending booking instead of creating a second one. Changing the dates on the page
 * does not silently re-aim that key — the server answers 409 and this screen says so.
 */
export function StartBookingReview({
  apartmentId,
  defaultStartDate,
}: {
  apartmentId: string;
  defaultStartDate?: string | null;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [startDate, setStartDate] = useState(defaultStartDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    idempotencyKey.current ??= `bi-${crypto.randomUUID()}`;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rentals/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId,
          startDate,
          idempotencyKey: idempotencyKey.current,
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
          onChange={(event) => setStartDate(event.target.value)}
          data-testid="booking-start-date"
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
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
