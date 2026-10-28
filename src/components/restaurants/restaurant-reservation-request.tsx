"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { VenueBookingForm } from "@/components/sheets/venue-booking-form";
import { useVenueBookingStatus } from "@/hooks/use-venue-booking-status";
import type { VenueBookingSubmitResult } from "@/lib/venues/venue-booking-form-schema";

/**
 * SAN-1542 — the customer side of the restaurant request journey.
 *
 * Reuses the existing venue-booking form, API and status reader. The submitted
 * request is linked to the canonical restaurant id, so the assigned partner sees
 * it in their inbox. Nothing claims a confirmed reservation: the real stored
 * status is shown.
 */
export function RestaurantReservationRequest({
  restaurantId,
  placeId,
  venueTitle,
}: {
  restaurantId: string;
  placeId?: string;
  venueTitle: string;
}) {
  const { chip } = useVenueBookingStatus({ placeId, restaurantId, uiKind: "restaurant" });
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<VenueBookingSubmitResult | null>(null);

  return (
    <section
      aria-labelledby="restaurant-request"
      className="mt-6 rounded-xl border p-4"
      data-testid="restaurant-reservation-request"
    >
      <h2 className="text-lg font-semibold" id="restaurant-request">
        Request a table
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This sends a request to {venueTitle}. It is not a confirmed reservation until the
        restaurant replies.
      </p>

      {chip ? (
        <p className="mt-2 text-sm" data-testid="restaurant-request-status">
          Your latest request: <span className="font-medium">{chip.label}</span>
        </p>
      ) : null}

      {result ? (
        <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3 text-sm" data-testid="restaurant-request-submitted">
          <p className="font-medium">Request saved</p>
          <p className="mt-1 text-muted-foreground">{result.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">Reference {result.requestId}</p>
        </div>
      ) : null}

      {open ? (
        <div className="mt-3">
          <VenueBookingForm
            venueKind="restaurant"
            placeId={placeId}
            venueTitle={venueTitle}
            restaurantId={restaurantId}
            onSuccess={(submitted) => {
              setResult(submitted);
              setOpen(false);
            }}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11"
          data-testid="restaurant-request-open"
          onClick={() => setOpen(true)}
        >
          Request a table
        </Button>
      )}
    </section>
  );
}
