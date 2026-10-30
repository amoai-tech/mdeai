import Link from "next/link";
import { notFound } from "next/navigation";
import { SignInRequired } from "@/components/auth/sign-in-required";
import { BookingReviewSummary } from "@/components/rentals/booking-review-summary";
import { StartBookingReview } from "@/components/rentals/start-booking-review";
import { getRentalDetail, type RentalDetail } from "@/lib/rentals/get-rental-detail";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Review your booking · mdeai" };

type Props = { searchParams?: Promise<{ apartment?: string | string[] }> };

/**
 * SAN-481 — the booking review screen a renter reaches from an apartment.
 *
 * It shows only what is actually known: the listing's own details and the dates the renter
 * picks. Choosing a move-in date and submitting creates (or resumes) exactly one pending
 * booking through /api/rentals/bookings, then shows the persisted state at
 * /rentals/bookings/[id]. Nothing here starts a payment or invents an amount.
 */
export default async function NewBookingReviewPage({ searchParams }: Props) {
  const requested = (await searchParams)?.apartment;
  const apartmentId = typeof requested === "string" ? requested : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const returnTo = apartmentId
    ? `/rentals/bookings/new?apartment=${encodeURIComponent(apartmentId)}`
    : "/rentals/bookings/new";

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="booking-review-auth-required">
        <SignInRequired
          returnTo={returnTo}
          title="Sign in to review a booking"
          description="A booking review is tied to your account so it can be resumed and paid exactly once."
          buttonLabel="Sign in to continue"
          testId="booking-review-sign-in"
        />
      </main>
    );
  }

  if (!apartmentId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="booking-review-missing-apartment">
        <h1 className="font-serif text-2xl font-semibold">Choose an apartment first</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Open the apartment you want, then start the booking review from its page.
        </p>
        <Link href="/rentals" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          Browse rentals
        </Link>
      </main>
    );
  }

  let detail: RentalDetail | null = null;
  try {
    detail = await getRentalDetail(apartmentId, { client: supabase });
  } catch {
    detail = null;
  }
  if (!detail) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6" data-testid="booking-review-new">
      <Link
        href={`/rentals/${encodeURIComponent(detail.id)}`}
        className="text-sm text-muted-foreground hover:text-foreground"
        data-testid="booking-review-back"
      >
        ← Back to apartment
      </Link>
      <h1 className="mt-3 font-serif text-2xl font-semibold">Review your booking</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Check the apartment and your move-in date. Nothing is charged yet.
      </p>

      <div className="mt-4">
        <BookingReviewSummary
          detail={detail}
          fallbackTitle={detail.title}
          startDate=""
          endDate={null}
        />
      </div>

      <StartBookingReview apartmentId={detail.id} />
    </main>
  );
}
