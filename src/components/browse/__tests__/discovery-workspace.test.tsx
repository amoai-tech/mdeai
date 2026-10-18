import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/rentals" }));
vi.mock("@/components/auth/auth-status", () => ({ AuthStatus: () => <span data-testid="auth-status" /> }));

import { DiscoveryWorkspace } from "../DiscoveryWorkspace";

function render() {
  return renderToStaticMarkup(
    <DiscoveryWorkspace
      testId="rentals-browse"
      activeSlug="rentals"
      title="Rentals in Medellín"
      subtitle="9 apartments"
      filterBar={<div data-testid="filters" />}
      rightPanel={<div data-testid="right-panel" />}
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

  it("gives phones a menu button", () => {
    expect(render()).toContain('data-testid="nav-drawer-trigger"');
  });
});
