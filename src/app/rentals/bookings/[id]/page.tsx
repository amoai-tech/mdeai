import Link from "next/link";
import { notFound } from "next/navigation";
import { SignInRequired } from "@/components/auth/sign-in-required";
import { BookingReviewSummary } from "@/components/rentals/booking-review-summary";
import { Button } from "@/components/ui/button";
import { getRentalDetail, type RentalDetail } from "@/lib/rentals/get-rental-detail";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Your booking · mdeai" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

const STATUS_DETAIL: Record<string, string> = {
  pending: "Saved and waiting for payment. No card has been charged.",
  confirmed: "Payment was verified and the booking is confirmed.",
  cancelled: "This booking was cancelled. It will not be charged.",
  completed: "This stay is complete.",
  no_show: "This booking was recorded as a no-show.",
};

type Props = { params: Promise<{ id: string }> };

/**
 * SAN-481 — the persisted booking review.
 *
 * Reads the renter's own booking through their RLS client, so another renter's booking id
 * answers 404 rather than leaking its contents. The page never derives "confirmed" from a
 * return URL or a browser event: the status shown is the authoritative stored state, which
 * only a verified Stripe webhook (SAN-1240) can move to confirmed.
 */
export default async function BookingReviewPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="booking-review-auth-required">
        <SignInRequired
          returnTo={`/rentals/bookings/${id}`}
          title="Sign in to see this booking"
          description="This booking review belongs to the account that started it."
          buttonLabel="Sign in to continue"
          testId="booking-review-sign-in"
        />
      </main>
    );
  }

  if (!UUID_RE.test(id)) notFound();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, user_id, booking_type, resource_id, resource_title, start_date, end_date, status, payment_status, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="booking-review-error">
        <h1 className="font-serif text-2xl font-semibold">We couldn’t load this booking</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please refresh and try again.</p>
        <Link href={`/rentals/bookings/${id}`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Refresh
        </Link>
      </main>
    );
  }

  // Another renter's booking is invisible under RLS; treat it exactly like a missing one.
  if (!booking || booking.booking_type !== "apartment" || booking.user_id !== user.id) {
    notFound();
  }

  let detail: RentalDetail | null = null;
  let detailUnavailable = false;
  try {
    detail = await getRentalDetail(booking.resource_id, { client: supabase });
  } catch {
    // The booking itself is authoritative and stays visible; only the listing detail failed.
    // Say so, rather than rendering "Price not stated" as if the listing had no price.
    detailUnavailable = true;
  }

  const status = String(booking.status);
  const statusLabel = STATUS_LABEL[status] ?? status;
  const canPay = status === "pending";

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6" data-testid="booking-review">
      <Link
        href={`/rentals/${encodeURIComponent(booking.resource_id)}`}
        className="text-sm text-muted-foreground hover:text-foreground"
        data-testid="booking-review-back"
      >
        ← Back to apartment
      </Link>
      <h1 className="mt-3 font-serif text-2xl font-semibold">Review your booking</h1>

      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="booking-review-status">
        <span className="rounded-full border border-border px-3 py-1 font-medium">{statusLabel}</span>
        <span className="text-muted-foreground">{STATUS_DETAIL[status] ?? "Saved booking."}</span>
      </p>

      <div className="mt-4">
        {detailUnavailable ? (
          <div
            className="mb-3 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 text-sm"
            role="status"
            data-testid="booking-review-detail-unavailable"
          >
            <p className="font-medium">We couldn’t load the apartment details just now.</p>
            <p className="mt-1 text-muted-foreground">
              Your booking is safe and unchanged. The price below is not shown until the listing
              reads again.
            </p>
            <Link
              href={`/rentals/bookings/${booking.id}`}
              className="mt-2 inline-block font-medium text-primary hover:underline"
              data-testid="booking-review-detail-retry"
            >
              Retry
            </Link>
          </div>
        ) : null}
        <BookingReviewSummary
          detail={detail}
          fallbackTitle={booking.resource_title}
          startDate={booking.start_date}
          endDate={booking.end_date}
          detailUnavailable={detailUnavailable}
        />
      </div>

      <section className="mt-6 rounded-xl border border-border p-4" aria-labelledby="booking-payment-heading">
        <h2 id="booking-payment-heading" className="text-lg font-semibold">
          Payment
        </h2>
        {canPay ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Card payment is not enabled in this environment yet. Your booking is saved and no
              charge has been made — you can safely leave this page and come back.
            </p>
            <Button type="button" className="mt-3 w-full" disabled data-testid="booking-review-payment-cta">
              Continue to payment
            </Button>
            <p className="mt-2 text-xs text-muted-foreground" data-testid="booking-review-payment-note">
              Refreshing or reopening this page never creates a second booking.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground" data-testid="booking-review-payment-note">
            {status === "cancelled"
              ? "No payment can be started for a cancelled booking."
              : "No payment action is available for this booking."}
          </p>
        )}
      </section>

      <p className="mt-6 text-xs text-muted-foreground" data-testid="booking-review-reference">
        Booking reference <span className="font-mono">{booking.id}</span>
      </p>
    </main>
  );
}
