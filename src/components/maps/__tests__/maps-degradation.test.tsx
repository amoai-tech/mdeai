// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SAN-1349 — a broken Google Map must degrade ONLY the map.
 *
 * `MapsShell` used to return the "map unavailable" panel *instead of* its
 * children. `geo-chat-shell` wraps the entire concierge — including the
 * CopilotKit composer — in `MapsShell`, so a Maps key problem unmounted the chat
 * and certification failed at `expect(copilot-send-button).toBeEnabled()` on a
 * page that no longer had a composer. Production could not be promoted.
 *
 * These tests pin the invariant: the concierge survives, the map falls back.
 */

const mocks = vi.hoisted(() => ({
  authFailed: { value: false },
  apiKey: { value: "test-key" as string | undefined },
}));

vi.mock("@/components/maps/use-maps-auth-failure", () => ({
  useMapsAuthFailure: () => mocks.authFailed.value,
}));

vi.mock("@/platform/maps/map-config", () => ({
  getGoogleMapsApiKey: () => mocks.apiKey.value,
  getGoogleMapsMapId: () => "test-map-id",
  isE2EMapsMockEnabled: () => false,
  MEDELLIN_CENTER: { lat: 6.2518, lng: -75.5636 },
  DEFAULT_MAP_ZOOM: 12,
}));

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="google-map">{children}</div>
  ),
  AdvancedMarker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useMap: () => null,
  useMapsLibrary: () => null,
}));

vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({
    pins: [],
    activeMapCategory: null,
    selectedPinId: null,
    panToPin: () => {},
  }),
}));

import { MapsShell } from "@/components/maps/MapProvider";
import { ChatMap } from "@/components/maps/ChatMap";
import { MapsUnavailable } from "@/components/maps/maps-status";

beforeEach(() => {
  mocks.authFailed.value = false;
  mocks.apiKey.value = "test-key";
});

describe("SAN-1349 · MapsShell never replaces its children", () => {
  it("keeps the concierge mounted when Maps auth has failed", () => {
    mocks.authFailed.value = true;

    const html = renderToStaticMarkup(
      <MapsShell>
        <div data-testid="concierge-composer">composer</div>
      </MapsShell>,
    );

    // The regression: this content used to be replaced by the Maps error panel.
    expect(html).toContain('data-testid="concierge-composer"');
  });

  it("keeps the concierge mounted when the API key is missing", () => {
    mocks.apiKey.value = undefined;

    const html = renderToStaticMarkup(
      <MapsShell>
        <div data-testid="concierge-composer">composer</div>
      </MapsShell>,
    );

    expect(html).toContain('data-testid="concierge-composer"');
  });

  it("still provides the API provider on the happy path", () => {
    const html = renderToStaticMarkup(
      <MapsShell>
        <div data-testid="concierge-composer">composer</div>
      </MapsShell>,
    );

    expect(html).toContain('data-testid="api-provider"');
    expect(html).toContain('data-testid="concierge-composer"');
  });
});

describe("SAN-1349 · ChatMap degrades locally", () => {
  it("renders the auth fallback and NO google map when auth failed", () => {
    mocks.authFailed.value = true;

    const html = renderToStaticMarkup(
      <MapsShell>
        <ChatMap mapDomId="chat-map" />
      </MapsShell>,
    );

    expect(html).toContain('data-maps-unavailable="auth-failed"');
    expect(html).toContain('data-testid="map-auth-error"');
    expect(html).not.toContain('data-testid="google-map"');
  });

  it("renders the google map when everything is healthy", () => {
    const html = renderToStaticMarkup(
      <MapsShell>
        <ChatMap mapDomId="chat-map" />
      </MapsShell>,
    );

    expect(html).toContain('data-testid="google-map"');
    expect(html).not.toContain("data-maps-unavailable");
  });
});

describe("SAN-1349 · MapsUnavailable copy", () => {
  it("reports the missing-key state with the original test id", () => {
    const html = renderToStaticMarkup(<MapsUnavailable reason="no-key" />);
    expect(html).toContain('data-testid="map-env-error"');
    expect(html).toContain("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  });

  it("reports the auth-failure state with operator guidance", () => {
    const html = renderToStaticMarkup(<MapsUnavailable reason="auth-failed" />);
    expect(html).toContain('data-testid="map-auth-error"');
    expect(html).toContain("Google Maps authentication failed");
  });
});
