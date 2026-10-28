import { MapPin, Navigation } from "lucide-react";
import type { PublicEventVenue } from "@/lib/events/types";
import { cn } from "@/lib/utils";
import { buildListedAreaMapUrl, buildVenueDirectionsUrl } from "@/lib/events/event-map-links";

type EventVenueSectionProps = {
  venue: PublicEventVenue;
  className?: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Show a listed area, not a verified exact destination, without a linked venue. */
  listedAreaOnly?: boolean;
};

export function EventVenueSection({
  venue, className, latitude, longitude, listedAreaOnly = false,
}: EventVenueSectionProps) {
  const street = venue.address?.trim();
  const locationLine = [street, street?.toLowerCase().includes((venue.city ?? "").toLowerCase())
    ? null : venue.city].filter(Boolean).join(" · ");
  const locationUrl = listedAreaOnly
    ? buildListedAreaMapUrl(street || venue.city)
    : buildVenueDirectionsUrl(street ?? null, latitude, longitude);

  return (
    <section className={cn("space-y-3 border-t border-border pt-6", className)}
      data-testid="event-venue-section" aria-labelledby="event-venue-heading">
      <h2 id="event-venue-heading" className="text-lg font-semibold tracking-tight">{listedAreaOnly ? "Listed location" : "Location & directions"}</h2>
      <div className="flex items-start gap-3">
        <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">{venue.name}</p>
          {locationLine && locationLine !== venue.name ? (
            <p className="text-sm text-muted-foreground">{locationLine}</p>
          ) : null}
          {listedAreaOnly ? (
            <p className="text-sm text-muted-foreground" data-testid="event-location-unconfirmed">
              The exact venue or meeting point has not been confirmed. Check with the organizer before traveling.
            </p>
          ) : null}
          {locationUrl ? (
            <a href={locationUrl} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
              data-testid={listedAreaOnly ? "event-listed-area-map" : "event-directions"}>
              <Navigation aria-hidden className="size-4" /> {listedAreaOnly ? "View listed area on map" : "Get directions"}
              <span className="sr-only">(opens Google Maps in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
