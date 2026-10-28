import { MapPin, Navigation } from "lucide-react";
import type { PublicEventVenue } from "@/lib/events/types";
import { cn } from "@/lib/utils";

type EventVenueSectionProps = {
  venue: PublicEventVenue;
  className?: string;
  latitude?: number | null;
  longitude?: number | null;
};

/** Map only real saved place data. A generic city is not a precise pin. */
export function buildVenueDirectionsUrl(
  address: string | null,
  latitude?: number | null,
  longitude?: number | null,
): string | null {
  const destination = address?.trim()
    || (latitude != null && longitude != null
      && Number.isFinite(latitude) && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? `${latitude},${longitude}`
        : null);
  if (!destination) return null;
  const params = new URLSearchParams({ api: "1", destination });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function EventVenueSection({
  venue, className, latitude, longitude,
}: EventVenueSectionProps) {
  const street = venue.address?.trim();
  const locationLine = [street, street?.toLowerCase().includes((venue.city ?? "").toLowerCase())
    ? null : venue.city].filter(Boolean).join(" · ");
  const directions = buildVenueDirectionsUrl(street ?? null, latitude, longitude);

  return (
    <section className={cn("space-y-3 border-t border-border pt-6", className)}
      data-testid="event-venue-section" aria-labelledby="event-venue-heading">
      <h2 id="event-venue-heading" className="text-lg font-semibold tracking-tight">Location</h2>
      <div className="flex items-start gap-3">
        <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">{venue.name}</p>
          {locationLine && locationLine !== venue.name ? (
            <p className="text-sm text-muted-foreground">{locationLine}</p>
          ) : null}
          {directions ? (
            <a href={directions} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
              data-testid="event-directions">
              <Navigation aria-hidden className="size-4" /> Get directions
              <span className="sr-only">(opens Google Maps in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
