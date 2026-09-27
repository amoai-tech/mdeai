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
  e2eMock: { value: false },
}));

vi.mock("@/components/maps/use-maps-auth-failure", () => ({
  useMapsAuthFailure: () => mocks.authFailed.value,
}));

vi.mock("@/platform/maps/map-config", () => ({
  getGoogleMapsApiKey: () => mocks.apiKey.value,
  getGoogleMapsMapId: () => "test-map-id",
  isE2EMapsMockEnabled: () => mocks.e2eMock.value,
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
import { MapsUnavailable, useMapsStatus } from "@/components/maps/maps-status";
import { RentalsListingsMap } from "@/components/host/rentals/rentals-listings-map";

beforeEach(() => {
  mocks.authFailed.value = false;
  mocks.apiKey.value = "test-key";
  mocks.e2eMock.value = false;
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

  it("honours a caller className so a small slot can size the fallback", () => {
    const html = renderToStaticMarkup(
      <MapsUnavailable reason="auth-failed" className="custom-slot-class" />,
    );
    // The caller's class must land on the outer wrapper. (The inner
    // MapRefererHelp panel keeps its own min-height; callers with a shorter slot
    // clip it with overflow-hidden, which is why the teaser drops its border.)
    expect(html).toContain('class="custom-slot-class"');
  });
});

/**
 * Review on #135: @vis.gl throws "<Map> can only be used inside an
 * <ApiProvider> component." So anywhere MapsShell mounts children WITHOUT an
 * APIProvider, every map slot must render a fallback rather than a <Map>.
 * Two ways that happens: the key is missing, and the E2E maps mock is enabled.
 */
describe("SAN-1349 · no <Map> is ever rendered without an APIProvider", () => {
  function Probe() {
    return <div data-testid="status">{useMapsStatus()}</div>;
  }

  it("reports no-key (not ok) when used with no provider and no API key", () => {
    mocks.apiKey.value = undefined;

    const html = renderToStaticMarkup(<Probe />);

    expect(html).toContain("no-key");
    expect(html).not.toContain(">ok<");
  });

  it("keeps reporting auth-failed with no provider when the flag is set", () => {
    mocks.authFailed.value = true;

    const html = renderToStaticMarkup(<Probe />);

    expect(html).toContain("auth-failed");
  });

  it("renders a static broker map under the E2E mock instead of throwing", () => {
    mocks.e2eMock.value = true;

    const html = renderToStaticMarkup(
      <RentalsListingsMap
        listings={[
          {
            id: "l1",
            title: "Laureles 2BR",
            latitude: 6.25,
            longitude: -75.59,
          } as never,
        ]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    expect(html).toContain('data-e2e-mock-map="true"');
    expect(html).not.toContain('data-testid="google-map"');
  });
});
