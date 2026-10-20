"use client";

import { useRouter } from "next/navigation";
import { Map, AdvancedMarker, AdvancedMarkerAnchorPoint } from "@vis.gl/react-google-maps";
import { HostErrorBoundary } from "@/components/host/host-error-boundary";
import { MapsShell } from "@/components/maps/MapProvider";
import { useMapsStatus } from "@/components/maps/use-maps-auth-failure";
import { MapsUnavailable } from "@/components/maps/map-referer-help";
import { getGoogleMapsMapId, isE2EMapsMockEnabled } from "@/platform/maps/map-config";

const TEASER_PINS = [
  { id: "laureles",  lat: 6.2516, lng: -75.5918, label: "Rentals in Laureles",           query: "Rentals in Laureles" },
  { id: "poblado",   lat: 6.2099, lng: -75.5686, label: "Rooftop bars in El Poblado",    query: "Rooftop bars in El Poblado" },
  { id: "envigado",  lat: 6.1752, lng: -75.5927, label: "Local eats in Envigado",        query: "Restaurants in Envigado" },
  { id: "centro",    lat: 6.2518, lng: -75.5636, label: "Events at El Centro",           query: "Events at El Centro Medellín" },
  { id: "provenza",  lat: 6.2075, lng: -75.5699, label: "Cafés near Provenza",           query: "Cafés near Provenza Medellín" },
] as const;

/** The view that holds every pin with room around it, so no pin sits on the map's edge. */
const PIN_BOUNDS = {
  north: Math.max(...TEASER_PINS.map((p) => p.lat)),
  south: Math.min(...TEASER_PINS.map((p) => p.lat)),
  east: Math.max(...TEASER_PINS.map((p) => p.lng)),
  west: Math.min(...TEASER_PINS.map((p) => p.lng)),
};
const PIN_BOUNDS_PADDING = { top: 56, bottom: 56, left: 56, right: 56 };

/** A 44px tap target around a small visible dot. */
function TeaserPin({ label }: { label: string }) {
  return (
    <div aria-label={label} className="group flex size-11 cursor-pointer items-center justify-center">
      <span className="size-4 rounded-full bg-primary shadow-md ring-2 ring-background transition-transform duration-150 group-hover:scale-125 motion-reduce:group-hover:scale-100" />
    </div>
  );
}

function MapTeaser() {
  const router = useRouter();
  const mapId = getGoogleMapsMapId();
  const mapsStatus = useMapsStatus();

  if (isE2EMapsMockEnabled()) {
    return (
      <div
        data-testid="home-map-teaser-mock"
        className="relative h-[260px] w-full overflow-hidden rounded-2xl border border-border sm:h-[320px] md:h-[380px]"
      >
        {TEASER_PINS.map(({ id, label, query }) => (
          <button key={id} type="button" onClick={() => router.push(`/chat?q=${encodeURIComponent(query)}`)}>
            {label}
          </button>
        ))}
      </div>
    );
  }

  // SAN-1349: the teaser degrades on its own; it must not take the page with it.
  // One wrapper for both states — only the border differs, because
  // MapsUnavailable draws its own. See map-referer-help.tsx for the clip.
  const available = mapsStatus === "ok";
  return (
    <div
      className={`relative h-[260px] w-full overflow-hidden rounded-2xl sm:h-[320px] md:h-[380px] ${
        // The fallback notice is see-through, so on the green hero it needs a solid surface to stay readable.
        available ? "border border-border" : "bg-background"
      }`}
    >
      {/* The boundary sits ABOVE the available/unavailable swap on purpose. When Google rejects the
          key after load the page swaps the <Map> for the notice, and the pins throw while they are
          torn down. A boundary inside the swapped branch is removed with it and catches nothing; one
          that survives the swap contains the throw, so a broken map only degrades the map slot and
          never replaces the whole homepage with the route error page. */}
      <HostErrorBoundary
        label="home-map"
        fallback={
          <div className="h-full bg-background">
            <MapsUnavailable reason="auth-failed" />
          </div>
        }
      >
        {available ? (
          <>
            <Map
              mapId={mapId}
              defaultBounds={{ ...PIN_BOUNDS, padding: PIN_BOUNDS_PADDING }}
              gestureHandling="none"
              disableDefaultUI
              className="h-full w-full"
              aria-label="Map of Medellín showing neighbourhoods to ask about"
            >
              {TEASER_PINS.map(({ id, lat, lng, label, query }) => (
                <AdvancedMarker
                  key={id}
                  position={{ lat, lng }}
                  anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                  onClick={() => router.push(`/chat?q=${encodeURIComponent(query)}`)}
                >
                  <TeaserPin label={label} />
                </AdvancedMarker>
              ))}
            </Map>
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-sm">
              ▣ Google Maps
            </div>
          </>
        ) : (
          <MapsUnavailable reason={mapsStatus} />
        )}
      </HostErrorBoundary>
    </div>
  );
}

/** Neighbourhood prompts on a real map of Medellín. The pins are areas to ask about, not listings. */
export function HomeMapPreview() {
  return (
    <div data-testid="home-map-preview">
      <MapsShell>
        <MapTeaser />
      </MapsShell>
      <p className="mt-2 text-sm text-primary-foreground/75">
        Tap an area to ask the concierge about it.
      </p>
    </div>
  );
}
