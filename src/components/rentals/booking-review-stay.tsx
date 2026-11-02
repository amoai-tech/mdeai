"use client";

import { useState } from "react";
import type { RentalDetail } from "@/lib/rentals/get-rental-detail";
import { BookingReviewSummary } from "@/components/rentals/booking-review-summary";
import { StartBookingReview } from "@/components/rentals/start-booking-review";

/**
 * SAN-1611 — the review summary and the form share one copy of the dates.
 *
 * They used to read from two different places: the summary was server-rendered from the URL while
 * the form held its own state, so editing a date left the summary showing the old stay. Owning both
 * here means the renter never sees two different dates on one screen.
 */
export function BookingReviewStay({
  detail,
  fallbackTitle,
  initialStart,
  initialEnd,
  detailUnavailable = false,
}: {
  detail: RentalDetail | null;
  fallbackTitle: string;
  initialStart: string | null;
  initialEnd: string | null;
  detailUnavailable?: boolean;
}) {
  const [startDate, setStartDate] = useState(initialStart ?? "");
  const [endDate, setEndDate] = useState(initialEnd ?? "");

  return (
    <>
      <BookingReviewSummary
        detail={detail}
        fallbackTitle={fallbackTitle}
        startDate={startDate}
        endDate={endDate || null}
        detailUnavailable={detailUnavailable}
      />
      <StartBookingReview
        apartmentId={detail?.id ?? ""}
        defaultStartDate={initialStart}
        defaultEndDate={initialEnd}
        onDatesChange={(start, end) => {
          setStartDate(start);
          setEndDate(end);
        }}
      />
    </>
  );
}
