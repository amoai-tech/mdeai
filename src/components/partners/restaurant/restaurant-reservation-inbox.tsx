import type { ReservationRequestRow } from "@/lib/restaurants/restaurant-owner-load";
import { venueBookingStatusChip } from "@/lib/venues/venue-booking-status-display";
const requestDateFormat = new Intl.DateTimeFormat("en-US", {dateStyle:"medium",timeStyle:"short",timeZone:"America/Bogota"});

/**
 * SAN-1542 — the real reservation-request inbox for one restaurant.
 *
 * Rows come from `public.venue_booking_requests` through the partner-scoped read
 * policy. There is no fabricated booking, availability or confirmation: an empty
 * result states that no request exists yet.
 */
export function RestaurantReservationInbox({
  status,
  requests,
}: {
  status: "loaded" | "error";
  requests: ReservationRequestRow[];
}) {
  return (
    <section aria-labelledby="restaurant-requests" data-testid="restaurant-reservation-inbox">
      <h3 id="restaurant-requests" className="text-base font-semibold">
        Reservation requests
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Requests customers actually submitted for this restaurant. Status is shown exactly as stored.
      </p>

      {status === "error" ? (
        <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          We could not load reservation requests. Refresh to try again.
        </p>
      ) : requests.length === 0 ? (
        <p
          data-testid="restaurant-requests-empty"
          className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
        >
          No reservation requests yet. When a customer requests a table through MDE, it will appear
          here with its real status.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2" data-testid="restaurant-requests-list">
          {requests.map((request) => {
            const chip = venueBookingStatusChip(request.status);
            return (
              <li key={request.id} className="rounded-xl border border-border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {request.contact_name} · {request.party_size ?? "?"} guests
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">
                    {chip?.label ?? request.status}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  Requested for {requestDateFormat.format(new Date(request.requested_at))}
                </p>
                <p className="mt-1 break-words text-muted-foreground">
                  {request.contact_email}
                  {request.contact_phone ? ` · ${request.contact_phone}` : ""}
                </p>
                {request.notes ? <p className="mt-1 text-muted-foreground">“{request.notes}”</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Submitted {requestDateFormat.format(new Date(request.created_at))} · {request.source}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
