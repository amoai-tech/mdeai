// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EventDetailMap } from "@/components/events/event-detail-map";

// The real map runtime needs Google's script; these stand-ins keep the *decisions*
// (marker or not, which link, which note) under test without loading Maps.
vi.mock("@vis.gl/react-google-maps", () => ({
  Map: ({ children, mapId }: { children?: React.ReactNode; mapId?: string }) =>
    <div data-testid="gm-map" data-mapid={String(mapId ?? "")}>{children}</div>,
  AdvancedMarker: ({ children, title }: { children?: React.ReactNode; title?: string }) =>
    <div data-testid="gm-marker" data-title={title}>{children}</div>,
}));

vi.mock("@/components/maps/MapProvider", () => ({
  // The shell only owns the provider/status; here the slot renders directly.
  MapsShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mapsStatus = { value: "ok" as "ok" | "no-key" | "auth-failed" | "load-failed" };
vi.mock("@/components/maps/use-maps-auth-failure", () => ({
  useMapsStatus: () => mapsStatus.value,
}));

vi.mock("@/platform/maps/map-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/maps/map-config")>()),
  isE2EMapsMockEnabled: () => false,
}));

// Reina: linked venue with saved coordinates.
const EXACT = {
  latitude: 6.2136466, longitude: -75.5582035, exact: true,
  label: "Hotel Intercontinental — Salón Real", address: "Calle 16 #28-51, El Poblado",
};
// Feria: a broad listed area, never a precise meeting point.
const APPROXIMATE = {
  latitude: 6.21088, longitude: -75.57091, exact: false,
  label: "Avenida El Poblado, Medellín", address: "Avenida El Poblado, Medellín",
};

describe("EventDetailMap truthfulness", () => {
  it("marks a linked venue and offers exact directions", () => {
    mapsStatus.value = "ok";
    const html = renderToStaticMarkup(<EventDetailMap {...EXACT} />);
    expect(html).toContain('data-map-exact="true"');
    expect(html).toContain('data-testid="event-map-pin"');
    expect(html).toContain('data-testid="event-map-directions"');
    expect(html).toContain("https://www.google.com/maps/dir/?api=1&amp;destination=");
    expect(html).not.toContain('data-testid="event-map-approximate"');
  });

  it("keeps an unconfirmed area as an area: no pin, explicit warning, area search", () => {
    mapsStatus.value = "ok";
    const html = renderToStaticMarkup(<EventDetailMap {...APPROXIMATE} />);
    expect(html).toContain('data-map-exact="false"');
    expect(html).not.toContain('data-testid="event-map-pin"');
    expect(html).toContain('data-testid="event-map-approximate"');
    expect(html).toContain("Exact meeting point not confirmed");
    expect(html).toContain('data-testid="event-map-area-search"');
    // A broad area must never launch turn-by-turn directions.
    expect(html).not.toContain("/maps/dir/");
  });

  it("falls back to a readable location link when no coordinates are saved", () => {
    mapsStatus.value = "ok";
    const html = renderToStaticMarkup(
      <EventDetailMap {...APPROXIMATE} latitude={null} longitude={null} />);
    expect(html).toContain('data-testid="event-map-fallback"');
    expect(html).toContain("No saved coordinates for this place");
    expect(html).not.toContain('data-testid="gm-map"');
  });

  it("does not break the page when Maps itself is unavailable", () => {
    mapsStatus.value = "auth-failed";
    const html = renderToStaticMarkup(<EventDetailMap {...EXACT} />);
    expect(html).toContain('data-testid="event-map-fallback"');
    expect(html).toContain("could not load");
    expect(html).toContain("Calle 16 #28-51");
    expect(html).not.toContain('data-testid="gm-map"');
  });

  it("rejects out-of-range coordinates instead of drawing a wrong pin", () => {
    mapsStatus.value = "ok";
    const html = renderToStaticMarkup(
      <EventDetailMap {...EXACT} latitude={999} longitude={-75.5} />);
    expect(html).toContain('data-testid="event-map-fallback"');
  });
});
