import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/rentals" }));
vi.mock("@/components/auth/auth-status", () => ({ AuthStatus: () => <span data-testid="auth-status" /> }));

import { DiscoveryWorkspace } from "../DiscoveryWorkspace";

function render(askComposer?: ReactNode) {
  return renderToStaticMarkup(
    <DiscoveryWorkspace
      mobileMapTrigger={<button type="button" data-testid="map-trigger-stub">Map</button>}
      testId="rentals-browse"
      activeSlug="rentals"
      title="Rentals in Medellín"
      subtitle="9 apartments"
      filterBar={<div data-testid="filters" />}
      rightPanel={<div data-testid="right-panel" />}
      askComposer={askComposer}
    >
      <section data-testid="results" />
    </DiscoveryWorkspace>,
  );
}

describe("DiscoveryWorkspace (SAN-1421)", () => {
  it("lays out side menu | results | map in the same grid as /chat", () => {
    const html = render();
    expect(html).toContain('data-testid="rentals-browse"');
    expect(html).toContain("lg:grid-cols-[208px_minmax(0,1fr)_minmax(0,1fr)]");
    // Order in the markup is the order on screen: menu, results, then the map column.
    const order = ["Left navigation", 'data-testid="results"', 'data-testid="right-panel"'].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("marks Rentals as the current page and offers a way into the real chat", () => {
    const html = render();
    expect(html).toMatch(/data-testid="nav-rentals-link"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/data-testid="nav-events-link"[^>]*aria-current/);
    expect(html).toContain('href="/chat"');
  });

  it("needs no chat session: it renders without any concierge provider", () => {
    // ChatNavRail throws outside the /chat provider stack; this page must not.
    expect(render).not.toThrow();
  });

  it("keeps the results and the map as separate scroll areas on desktop", () => {
    const html = render();
    expect(html).toMatch(/data-testid="workspace-results-column"/);
    expect(html).toContain("lg:overflow-y-auto");
    expect(html).toContain("lg:h-dvh");
  });

  it("places mobile Map inside the sticky header before filters and cards", () => {
    const html = render();
    const header = html.indexOf("<header ");
    const map = html.indexOf('data-testid="map-trigger-stub"');
    const filters = html.indexOf('data-testid="filters"');
    expect(header).toBeGreaterThanOrEqual(0);
    expect(map).toBeGreaterThan(header);
    expect(map).toBeLessThan(filters);
    expect(html).toContain('data-testid="workspace-mobile-map-trigger"');
  });

  it("gives phones a menu button", () => {
    expect(render()).toContain('data-testid="nav-drawer-trigger"');
  });

  it("pins a page's own ask composer to the bottom of the results column, after the results", () => {
    const html = render(<div data-testid="ask-composer" />);
    const resultsAt = html.indexOf('data-testid="results"');
    const composerAt = html.indexOf('data-testid="workspace-ask-composer"');

    expect(composerAt).toBeGreaterThan(resultsAt);
    expect(html).toContain('data-testid="ask-composer"');
    // Sticky inside the results scroll area, so it stays reachable while the cards scroll…
    expect(html).toMatch(/data-testid="workspace-ask-composer"[^>]*class="[^"]*sticky /);
    // …pinned above the phone tab bar there (SAN-1606), and back at the edge on desktop.
    expect(html).toMatch(/data-testid="workspace-ask-composer"[^>]*bottom-\[var\(--mde-mobile-nav-clearance\)\]/);
    expect(html).toMatch(/data-testid="workspace-ask-composer"[^>]*lg:bottom-0/);
    // The map column is still last on screen.
    expect(html.indexOf('data-testid="workspace-right-column"')).toBeGreaterThan(composerAt);
  });

  it("keeps last-card controls scrollable above the sticky composer and mobile nav", () => {
    expect(render(<div data-testid="ask-composer" />)).toContain("pb-64 sm:pb-24");
    expect(render()).not.toContain("pb-64 sm:pb-24");
  });

  it("renders no ask composer when the page has no conversation to show", () => {
    expect(render()).not.toContain('data-testid="workspace-ask-composer"');
  });
});
