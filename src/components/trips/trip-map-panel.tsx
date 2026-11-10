"use client";

import { useEffect } from "react";
import { AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";
import { MapsUnavailable } from "@/components/maps/map-referer-help";
import { useMapsStatus } from "@/components/maps/use-maps-auth-failure";
import {
  DEFAULT_MAP_ZOOM,
  MEDELLIN_CENTER,
  getGoogleMapsMapId,
  isE2EMapsMockEnabled,
} from "@/platform/maps/map-config";
import type { TripItemRow } from "@/lib/trips/trip-item-types";

export type TripMapPin = {
  id: string;
  title: string;
  locationName: string | null;
  lat: number;
  lng: number;
  /** Number shown on the pin; follows itinerary order, including gaps. */
  stopNumber: number;
};

/** Only finite coordinates become pins. A missing location never becomes a fake pin. */
function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function mappableTripPins(items: TripItemRow[]): TripMapPin[] {
  const mappable = items.filter(
    (item): item is TripItemRow & { latitude: number; longitude: number } =>
      item.latitude != null &&
      item.longitude != null &&
      isValidCoordinate(item.latitude, item.longitude),
  );
  // Number only the pins that actually render, 1..N. The missing-location item
  // still appears in the itinerary; it just has no pin.
  return mappable.map((item, index) => ({
    id: item.id,
    title: item.title,
    locationName: item.location_name,
    lat: item.latitude,
    lng: item.longitude,
    stopNumber: index + 1,
  }));
}

function FitToTripStops({ pins }: { pins: TripMapPin[] }) {
  const map = useMap();
  const signature = pins.map((pin) => `${pin.id}:${pin.lat}:${pin.lng}`).join("|");

  useEffect(() => {
    if (!map || pins.length === 0) return;
    if (pins.length === 1) {
      map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
      map.setZoom(15);
      return;
    }
    if (typeof google === "undefined") return;
    const bounds = new google.maps.LatLngBounds();
    for (const pin of pins) bounds.extend({ lat: pin.lat, lng: pin.lng });
    map.fitBounds(bounds, { top: 96, right: 48, bottom: 56, left: 48 });
    // Signature intentionally captures item identity and coordinates; the
    // pin array is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  return null;
}

function TripStopPin({
  pin,
  selected,
  onSelectItem,
}: {
  pin: TripMapPin;
  selected: boolean;
  onSelectItem: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`trip-map-pin-${pin.id}`}
      data-stop-number={pin.stopNumber}
      aria-label={`Stop ${pin.stopNumber}: ${pin.title}`}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onSelectItem(pin.id);
      }}
      className={
        selected
          ? "flex size-10 items-center justify-center rounded-full border-2 border-white bg-primary text-sm font-bold text-primary-foreground shadow-lg ring-4 ring-primary/30"
          : "flex size-9 items-center justify-center rounded-full border-2 border-white bg-foreground text-sm font-bold text-background shadow-md hover:scale-105"
      }
    >
      {pin.stopNumber}
    </button>
  );
}

function TripMapCanvas({
  pins,
  selectedItemId,
  onSelectItem,
}: {
  pins: TripMapPin[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
}) {
  if (isE2EMapsMockEnabled()) {
    return (
      <div
        data-testid="trip-map-mock"
        data-e2e-mock-map="true"
        className="flex h-full min-h-[280px] w-full flex-wrap content-start gap-3 overflow-auto bg-muted/30 p-4"
      >
        {pins.map((pin) => (
          <TripStopPin
            key={pin.id}
            pin={pin}
            selected={pin.id === selectedItemId}
            onSelectItem={onSelectItem}
          />
        ))}
      </div>
    );
  }

  const mapId = getGoogleMapsMapId();
  if (!mapId) {
    return (
      <div
        data-testid="trip-map-no-map-id"
        className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
      >
        <p>
          Map unavailable: set{" "}
          <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID</code> to
          render trip stops.
        </p>
      </div>
    );
  }

  return (
    <Map
      mapId={mapId}
      internalUsageAttributionIds={["gmp_git_agentskills_v1"]}
      defaultCenter={MEDELLIN_CENTER}
      defaultZoom={DEFAULT_MAP_ZOOM}
      gestureHandling="greedy"
      disableDefaultUI={false}
      className="h-full w-full"
      style={{ width: "100%", height: "100%" }}
    >
      <FitToTripStops pins={pins} />
      {pins.map((pin) => {
        const selected = pin.id === selectedItemId;
        return (
          <AdvancedMarker
            key={pin.id}
            position={{ lat: pin.lat, lng: pin.lng }}
            title={`Stop ${pin.stopNumber}: ${pin.title}`}
            onClick={() => onSelectItem(pin.id)}
          >
            <TripStopPin
              pin={pin}
              selected={selected}
              onSelectItem={onSelectItem}
            />
          </AdvancedMarker>
        );
      })}
    </Map>
  );
}

export function TripMapPanel({
  items,
  selectedItemId,
  onSelectItem,
}: {
  items: TripItemRow[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
}) {
  const mapsStatus = useMapsStatus();
  const pins = mappableTripPins(items);
  const selectedPin = pins.find((pin) => pin.id === selectedItemId) ?? null;

  if (mapsStatus !== "ok") {
    return (
      <section data-testid="trip-map-panel" className="space-y-3">
        <div className="h-[min(60vh,520px)] min-h-[320px] w-full">
          <MapsUnavailable reason={mapsStatus} />
        </div>
        <p className="text-xs text-muted-foreground">
          Your itinerary is still available below without the map.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="trip-map-panel" className="space-y-3">
      {pins.length === 0 ? (
        <p
          data-testid="trip-map-empty"
          className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No map pins yet — save a place with a real location to see it here.
        </p>
      ) : (
        <>
          <div
            data-testid="trip-map-canvas"
            className="h-[min(60vh,520px)] min-h-[320px] w-full overflow-hidden rounded-xl border border-border"
          >
            <TripMapCanvas
              pins={pins}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {pins.length} {pins.length === 1 ? "stop" : "stops"} on the map
            </span>
            <span>Tap a numbered stop to select it</span>
          </div>
          {selectedPin ? (
            <div
              data-testid="trip-map-selected-stop"
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <p className="font-medium">{selectedPin.title}</p>
              <p className="text-xs text-muted-foreground">
                Stop {selectedPin.stopNumber}
                {selectedPin.locationName ? ` · ${selectedPin.locationName}` : ""}
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
