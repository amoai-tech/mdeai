"use client";

import { Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { ExternalLink, MapPin } from "lucide-react";
import { MapsShell } from "@/components/maps/MapProvider";
import { useMapsStatus } from "@/components/maps/use-maps-auth-failure";
import { getGoogleMapsMapId, hasConfiguredMapId } from "@/lib/google-maps-map-id";
import { isE2EMapsMockEnabled } from "@/platform/maps/map-config";
import { buildListedAreaMapUrl, buildVenueDirectionsUrl } from "@/lib/events/event-map-links";
import { cn } from "@/lib/utils";

/** A confirmed venue point can zoom in; a listed area must stay wide enough to read as an area. */
const EXACT_ZOOM = 16;
const APPROXIMATE_ZOOM = 14;

export type EventDetailMapProps = {
  /** Saved event/venue coordinates. Never generated. */
  latitude: number | null;
  longitude: number | null;
  /** True only for a linked venue record: renders one point. A listed area never gets a pin. */
  exact: boolean;
  /** Venue name, or the listed area shown to the visitor. */
  label: string;
  address: string | null;
  className?: string;
};

function isUsablePoint(latitude: number | null, longitude: number | null): boolean {
  return latitude != null && longitude != null &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

/**
 * The text path is the accessible source of truth; the map is the illustration.
 * Every state below keeps the location readable and linkable, so a broken or
 * missing map degrades this card only — never tickets, navigation or Ask MDE.
 */
function LocationFallback({
  label, address, exact, note, className,
}: {
  label: string; address: string | null; exact: boolean; note: string; className?: string;
}) {
  const href = exact
    ? buildVenueDirectionsUrl(address ?? label, null, null)
    : buildListedAreaMapUrl(address ?? label);
  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-4", className)}
      aria-labelledby="event-map-heading"
      data-testid="event-map-fallback"
    >
      <h2 id="event-map-heading" className="text-sm font-semibold">Location</h2>
      <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{address ?? label}</span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground" data-testid="event-map-note">{note}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
          {exact ? "Open directions" : "View listed area on map"}
          <ExternalLink aria-hidden className="size-3.5" />
          <span className="sr-only">(opens Google Maps in a new tab)</span>
        </a>
      ) : null}
    </section>
  );
}

/**
 * A small, contained event map.
 *
 * Reuses the app's existing Maps provider (`MapsShell`) and `@vis.gl/react-google-maps`;
 * it does not mount browse pins or a second map context. Only saved coordinates are drawn.
 * A listed area shows the area and an explicit "exact meeting point not confirmed" note
 * with no marker, because a precise pin on an unconfirmed place sends people to the wrong street.
 */
function EventDetailMapSurface({
  latitude, longitude, exact, label, address, className,
}: EventDetailMapProps) {
  const mapsStatus = useMapsStatus();

  if (!isUsablePoint(latitude, longitude)) {
    return <LocationFallback className={className} label={label} address={address} exact={exact}
      note="No saved coordinates for this place. Use the map link for the listed area." />;
  }

  if (mapsStatus !== "ok") {
    return <LocationFallback className={className} label={label} address={address} exact={exact}
      note="The in-page map could not load. The location and map link below still work." />;
  }

  const center = { lat: latitude as number, lng: longitude as number };
  const mapId = getGoogleMapsMapId();
  const directionsHref = exact
    ? buildVenueDirectionsUrl(address ?? label, latitude, longitude)
    : buildListedAreaMapUrl(address ?? label);

  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}
      aria-labelledby="event-map-heading" data-testid="event-detail-map"
      data-map-exact={exact ? "true" : "false"}>
      <div className="relative h-[200px] w-full sm:h-[240px]">
        {isE2EMapsMockEnabled() ? (
          <div className="flex h-full items-center justify-center bg-muted text-xs text-muted-foreground"
            data-e2e-mock-map="true" data-testid="event-map-e2e-mock">
            Map placeholder (end-to-end test mode)
          </div>
        ) : (
          <Map
            defaultCenter={center}
            defaultZoom={exact ? EXACT_ZOOM : APPROXIMATE_ZOOM}
            gestureHandling="cooperative"
            mapId={hasConfiguredMapId() ? mapId : undefined}
            style={{ width: "100%", height: "100%" }}
            reuseMaps
            disableDefaultUI
            clickableIcons={false}
            aria-label={exact ? `Map showing ${label}` : `Map showing the approximate listed area ${label}`}
          >
            {exact ? (
              <AdvancedMarker position={center} title={label}>
                <div data-testid="event-map-pin"
                  className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-background">
                  <MapPin aria-hidden className="size-5" />
                </div>
              </AdvancedMarker>
            ) : null}
          </Map>
        )}
        {!exact ? (
          <span data-testid="event-map-approximate"
            className="absolute left-3 top-3 rounded-full bg-background/95 px-3 py-1 text-xs font-medium shadow-sm">
            Approximate listed area
          </span>
        ) : null}
        <h2 id="event-map-heading" className="sr-only">Location map</h2>
      </div>
      {!exact ? (
        <p className="px-3 pt-2 text-xs text-muted-foreground" data-testid="event-map-unconfirmed-note">
          Exact meeting point not confirmed. Check with the organizer before traveling.
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <p className="min-w-0 truncate text-sm font-medium">{label}</p>
        {directionsHref ? (
          <a href={directionsHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            data-testid={exact ? "event-map-directions" : "event-map-area-search"}>
            {exact ? "Directions" : "Open in Maps"}
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens Google Maps in a new tab)</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The event route does not mount a maps provider of its own, so the slot owns one.
 * `MapsShell` never replaces its children: a missing key or a failed script only
 * changes this card, which is why tickets, navigation and Ask MDE stay usable.
 */
export function EventDetailMap(props: EventDetailMapProps) {
  return (
    <MapsShell>
      <EventDetailMapSurface {...props} />
    </MapsShell>
  );
}
