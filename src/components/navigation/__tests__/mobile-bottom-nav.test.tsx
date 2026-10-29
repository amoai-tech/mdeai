import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

import { MobileBottomNav, resolveMobileNavTab } from "../mobile-bottom-nav";

function renderAt(pathname: string) {
  state.pathname = pathname;
  return renderToStaticMarkup(<MobileBottomNav />);
}

describe("resolveMobileNavTab (SAN-1606)", () => {
  it("serves the five consumer base routes", () => {
    expect(resolveMobileNavTab("/")).toBe("home");
    expect(resolveMobileNavTab("/chat")).toBe("chat");
    expect(resolveMobileNavTab("/rentals")).toBe("rentals");
    expect(resolveMobileNavTab("/restaurants")).toBe("restaurants");
    expect(resolveMobileNavTab("/events")).toBe("events");
  });

  it("keeps the active tab on ordinary consumer detail routes", () => {
    expect(resolveMobileNavTab("/rentals/2e3f4a5b-6c7d-8e9f-0a1b-2c3d4e5f6a7b")).toBe("rentals");
    expect(resolveMobileNavTab("/restaurants/2e3f4a5b-6c7d-8e9f-0a1b-2c3d4e5f6a7b")).toBe("restaurants");
    expect(resolveMobileNavTab("/events/reina-de-antioquia-2026-finals")).toBe("events");
  });

  it("tolerates a trailing slash and a query string", () => {
    expect(resolveMobileNavTab("/rentals/")).toBe("rentals");
    expect(resolveMobileNavTab("/events?category=music")).toBe("events");
  });

  it.each([
    ["/app", "the app workspace root"],
    ["/app/rentals", "the app rentals workspace"],
    ["/app/events", "the app events workspace"],
    ["/host/events", "the host workspace"],
    ["/admin", "admin"],
    ["/admin/event-bookings", "admin bookings"],
    ["/login", "auth"],
    ["/signup", "auth"],
    ["/auth/callback", "auth callback"],
    ["/checkout", "checkout"],
    ["/rentals/abc/apply", "a nested rental flow"],
    ["/rentals/abc/checkout", "a nested rental checkout"],
    ["/events/reina/checkout", "a nested event checkout"],
    ["/restaurants/abc/reserve", "a nested restaurant flow"],
    ["/rentals/checkout", "a transactional one-segment route"],
    ["/events/payment", "a payment one-segment route"],
    ["/chat/thread-123", "a nested chat route"],
    ["/cafes", "an unlisted consumer page"],
    ["/nightlife", "an unlisted consumer page"],
    ["/trips", "trips"],
    ["/saved", "saved"],
    ["/me", "account"],
    ["/blog/anything", "an unrelated page"],
  ])("never mounts the bar on %s (%s)", (pathname) => {
    expect(resolveMobileNavTab(pathname)).toBeNull();
    expect(renderAt(pathname)).toBe("");
  });

  it("renders nothing without a pathname", () => {
    expect(resolveMobileNavTab(undefined)).toBeNull();
    expect(resolveMobileNavTab("")).toBeNull();
  });
});

describe("MobileBottomNav (SAN-1606)", () => {
  it("renders exactly five tabs in the specified order with real hrefs", () => {
    const html = renderAt("/");
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual(["/", "/chat", "/rentals", "/restaurants", "/events"]);
    expect([...html.matchAll(/data-testid="mobile-nav-([a-z]+)"/g)].map((m) => m[1])).toEqual([
      "home",
      "chat",
      "rentals",
      "restaurants",
      "events",
    ]);
  });

  it("shows Home, Chat, Rentals, Eats and Events, and says Restaurants for Eats", () => {
    const html = renderAt("/");
    for (const label of ["Home", "Chat", "Rentals", "Eats", "Events"]) {
      expect(html).toContain(`>${label}</span>`);
    }
    // Visible "Eats" plus a screen-reader-only "Restaurants" so the accessible name contains both.
    expect(html).toMatch(/>Eats<\/span><span class="sr-only"> Restaurants<\/span>/);
  });

  it("uses 24px Lucide icons in a bar that hides at the desktop breakpoint", () => {
    const html = renderAt("/");
    expect(html.match(/class="lucide [^"]*size-6"/g)).toHaveLength(5);
    expect(html).toContain("lg:hidden");
    expect(html).toContain("max-w-[480px]");
    expect(html).toContain("h-16");
    expect(html).toContain("rounded-3xl");
  });

  it("marks exactly one tab as the current page, by styling and aria-current", () => {
    for (const [pathname, tab] of [
      ["/", "home"],
      ["/chat", "chat"],
      ["/rentals", "rentals"],
      ["/events/reina-de-antioquia-2026-finals", "events"],
      ["/restaurants/abc", "restaurants"],
    ] as const) {
      const html = renderAt(pathname);
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      expect(html).toMatch(
        new RegExp(`data-testid="mobile-nav-${tab}"[^>]*data-active="true"[^>]*aria-current="page"`),
      );
      expect(html.match(/data-active="true"/g)).toHaveLength(1);
      expect(html).toContain("bg-primary/10");
    }
  });

  it("names the landmark and each link is a real Next.js link", () => {
    const html = renderAt("/chat");
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('data-testid="mobile-bottom-nav"');
    expect(html.match(/<a /g)).toHaveLength(5);
  });
});
