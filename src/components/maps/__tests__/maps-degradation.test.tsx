// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SAN-1349 — a broken Google Map must degrade ONLY the map.
 *
 * `MapsShell` used to return the "map unavailable" panel *instead of* its
 * children, and `geo-chat-shell` wraps the entire concierge — the CopilotKit
 * composer included — in `MapsShell`. So a Maps key problem unmounted the chat
 * and certification failed on a page that had no composer, which froze
 * production promotion.
 *
 * The second invariant: no `<Map>` may render without an `APIProvider`, because
 * @vis.gl throws "<Map> can only be used inside an <ApiProvider> component."
 * That happens both when the key is missing and under the E2E maps mock.
 *
 * Auth failure is driven the real way — `window.__mdeMapsAuthFailed`, the flag
 * `useMapsAuthFailure` reads — so the hook itself is under test rather than
 * mocked away.
 */

const mocks = vi.hoisted(() => ({
  apiKey: { value: "test-key" as string | undefined },
  e2eMock: { value: false },
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
import { useMapsStatus } from "@/components/maps/use-maps-auth-failure";
import { RentalsListingsMap } from "@/components/host/rentals/rentals-listings-map";

const COMPOSER = <div data-testid="concierge-composer">composer</div>;

/** No `MapsStatusProvider` above it — exercises the provider-free fallback. */
function StatusProbe() {
  return <div data-testid="status">{useMapsStatus()}</div>;
}

beforeEach(() => {
  mocks.apiKey.value = "test-key";
  mocks.e2eMock.value = false;
  delete (window as unknown as { __mdeMapsAuthFailed?: boolean }).__mdeMapsAuthFailed;
});

describe("SAN-1349 · a broken map never unmounts the concierge", () => {
  it("keeps the composer mounted when Maps auth has failed", () => {
    (window as unknown as { __mdeMapsAuthFailed?: boolean }).__mdeMapsAuthFailed = true;

    expect(renderToStaticMarkup(<MapsShell>{COMPOSER}</MapsShell>)).toContain(
      'data-testid="concierge-composer"',
    );
  });

  it("keeps the composer mounted when the API key is missing", () => {
    mocks.apiKey.value = undefined;

    expect(renderToStaticMarkup(<MapsShell>{COMPOSER}</MapsShell>)).toContain(
      'data-testid="concierge-composer"',
    );
  });
});

describe("SAN-1349 · a broken map falls back locally", () => {
  it("swaps in the fallback and renders no <Map> when auth has failed", () => {
    (window as unknown as { __mdeMapsAuthFailed?: boolean }).__mdeMapsAuthFailed = true;

    const html = renderToStaticMarkup(
      <MapsShell>
        <ChatMap mapDomId="chat-map" />
      </MapsShell>,
    );

    expect(html).toContain('data-testid="map-referer-help"');
    expect(html).not.toContain('data-testid="google-map"');
  });

  it("still renders the real map when everything is healthy", () => {
    const html = renderToStaticMarkup(
      <MapsShell>
        <ChatMap mapDomId="chat-map" />
      </MapsShell>,
    );

    expect(html).toContain('data-testid="google-map"');
    expect(html).not.toContain('data-testid="map-referer-help"');
  });

  it("reports no-key, auth-failed and ok with no provider above it", () => {
    mocks.apiKey.value = undefined;
    expect(renderToStaticMarkup(<StatusProbe />)).toContain(
      'data-testid="status">no-key<',
    );

    mocks.apiKey.value = "test-key";
    expect(renderToStaticMarkup(<StatusProbe />)).toContain(
      'data-testid="status">ok<',
    );

    (window as unknown as { __mdeMapsAuthFailed?: boolean }).__mdeMapsAuthFailed = true;
    expect(renderToStaticMarkup(<StatusProbe />)).toContain(
      'data-testid="status">auth-failed<',
    );
  });

  it("renders the no-key fallback, not a <Map>, when the key is missing", () => {
    mocks.apiKey.value = undefined;

    const html = renderToStaticMarkup(
      <MapsShell>
        <ChatMap mapDomId="chat-map" />
      </MapsShell>,
    );

    expect(html).toContain('data-testid="map-env-error"');
    expect(html).not.toContain('data-testid="google-map"');
  });
});

describe("SAN-1349 · the broker map survives the E2E mock", () => {
  it("renders its stand-in instead of a <Map> with no APIProvider", () => {
    mocks.e2eMock.value = true;

    const html = renderToStaticMarkup(
      <RentalsListingsMap listings={[]} selectedId={null} onSelect={() => {}} />,
    );

    expect(html).toContain('data-e2e-mock-map="true"');
    expect(html).not.toContain('data-testid="google-map"');
  });
});
