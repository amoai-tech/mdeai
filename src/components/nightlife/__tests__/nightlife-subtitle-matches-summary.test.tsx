// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";

/**
 * The page subtitle and the search summary describe the same rows, so they must use the same word.
 *
 * A guest search that carries preferences returns *ranked* rows, not verified matches. The summary
 * already said "Suggestions"; the subtitle said "Search results", so one result set was described
 * two ways on one screen.
 */
vi.mock("@/hooks/use-is-lg-up", () => ({ useIsLgUp: () => true }));
vi.mock("@/components/browse/BrowseMapSheet", () => ({ BrowseMapSheet: () => <i /> }));
vi.mock("@/components/browse/BrowseMapPanel", () => ({ BrowseMapPanel: () => <div /> }));
vi.mock("@/components/browse/BrowseMapContextShell", () => ({
  BrowseMapContextShell: (p: { children: unknown }) => <div>{p.children as never}</div>,
}));
vi.mock("@/platform/maps/map-context", async () => {
  const actual = await vi.importActual<typeof import("@/platform/maps/map-context")>(
    "@/platform/maps/map-context",
  );
  return {
    ...actual,
    useMapContext: () => ({
      pins: [],
      selectedPinId: null,
      setSelectedPinId: () => {},
      panToPin: () => {},
      mergePinsByCategory: () => {},
      requestFitBounds: () => {},
    }),
    useMapPinSelect: () => () => {},
  };
});
vi.mock("@/components/browse/DiscoveryWorkspace", () => ({
  DiscoveryWorkspace: (p: { subtitle?: string; children: unknown; askComposer?: unknown; rightPanel?: unknown }) => (
    <div>
      <h1>Nightlife</h1>
      <p>{p.subtitle as never}</p>
      {p.askComposer as never}
      {p.rightPanel as never}
      {p.children as never}
    </div>
  ),
}));
vi.mock("@/components/auth/auth-status", () => ({ AuthStatus: () => <i /> }));
vi.mock("@/components/chat/discovery-page-context", () => ({ DiscoveryPageContext: () => <i /> }));
vi.mock("@/components/chat/guest-venue-search", () => ({ GuestVenueSearchScoped: () => <i /> }));
vi.mock("@/components/chat/discovery-ask-composer", () => ({
  DiscoveryAskComposer: (props: {
    guestVenues?: {
      onResults: (rows: GroundedToolRow[]) => void;
      onSearchMeta?: (meta: { preferences: string[] }) => void;
    };
  }) => {
    // Behave like the composer after a search: rows first, then the preference labels.
    (globalThis as unknown as { __fire: (rows: GroundedToolRow[], prefs: string[]) => void }).__fire = (
      rows,
      prefs,
    ) => {
      props.guestVenues?.onResults(rows);
      props.guestVenues?.onSearchMeta?.({ preferences: prefs });
    };
    return <i data-testid="composer" />;
  },
}));

import { NightlifeBrowseView } from "@/components/nightlife/nightlife-browse-view";

const row = (id: string): GroundedToolRow => ({ id, title: `Venue ${id}`, latitude: 6.2, longitude: -75.5 });
const fire = (rows: GroundedToolRow[], prefs: string[]) =>
  act(() => {
    (globalThis as unknown as { __fire: (r: GroundedToolRow[], p: string[]) => void }).__fire(rows, prefs);
  });
/** The workspace subtitle is the paragraph directly after the page heading. */
const subtitle = () => document.querySelector("h1 + p")?.textContent ?? "";
const view = () => <NightlifeBrowseView results={[]} error={null} neighborhood={null} vibe={null} />;

afterEach(cleanup);

describe("nightlife subtitle agrees with the search summary", () => {
  it("says Suggestions when the search carried preferences", () => {
    render(view());
    fire([row("a"), row("b")], ["quiet", "wifi/workspace"]);
    expect(subtitle()).toContain("Suggestions — 2 nightlife venues");
  });

  it("says Search results when the search was a name", () => {
    render(view());
    fire([row("a")], []);
    expect(subtitle()).toContain("Search results — 1 nightlife venue");
    expect(subtitle()).not.toContain("Suggestions");
  });
});
