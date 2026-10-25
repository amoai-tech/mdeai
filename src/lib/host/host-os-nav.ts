/**
 * SAN-1209 · HOST-OS-001 — Host OS nav model + route helpers.
 *
 * Pure (no React) so the active-route logic and route labels are unit-testable
 * without a DOM. The shell renders these once; pages never render nav again.
 *
 * SAN-1577 — the same workspace now has two URL families: legacy `/host/*`
 * (preserved) and `/app/events/*` inside the account shell. Links are chosen by
 * `basePath`; there is still only one nav component and one nav model.
 *
 * Phase-0 scope: Overview · Events · Analytics are live. Venues · Tickets ·
 * Inbox · Settings are reserved placeholders (disabled) — NOT pages this phase.
 */

export type HostOsNavItem = {
  href: string;
  label: string;
  testId: string;
  disabled?: boolean;
};

/** URL family that owns the host workspace. */
export type HostOsBasePath = "/host" | "/app/events";

/** Live legacy host OS destinations (Phase 0). Overview is the dashboard route. */
export const HOST_OS_NAV_ITEMS: HostOsNavItem[] = [
  { href: "/host/dashboard", label: "Overview", testId: "host-os-nav-overview" },
  { href: "/host/events", label: "Events", testId: "host-os-nav-events" },
  { href: "/host/analytics", label: "Analytics", testId: "host-os-nav-analytics" },
];

/** Live /app Events workspace destinations. */
export const HOST_OS_APP_NAV_ITEMS: HostOsNavItem[] = [
  { href: "/app/events/overview", label: "Overview", testId: "host-os-nav-overview" },
  { href: "/app/events", label: "Events", testId: "host-os-nav-events" },
  { href: "/app/events/analytics", label: "Analytics", testId: "host-os-nav-analytics" },
];

/** Reserved future destinations — shown disabled, never linked this phase. */
export const HOST_OS_NAV_PLACEHOLDERS: HostOsNavItem[] = [
  { href: "/host/venues", label: "Venues", testId: "host-os-nav-venues", disabled: true },
  { href: "/host/tickets", label: "Tickets", testId: "host-os-nav-tickets", disabled: true },
  { href: "/host/inbox", label: "Inbox", testId: "host-os-nav-inbox", disabled: true },
  { href: "/host/settings", label: "Settings", testId: "host-os-nav-settings", disabled: true },
];

/** The live nav for the requested URL family. */
// skipcq: JS-0067 - ES module export; not browser global scope
export function hostOsNavItems(basePath: HostOsBasePath = "/host"): HostOsNavItem[] {
  return basePath === "/app/events" ? HOST_OS_APP_NAV_ITEMS : HOST_OS_NAV_ITEMS;
}

/** True when `href` is the active host OS destination for `pathname`. */
// skipcq: JS-0067 - ES module export; not browser global scope
export function isHostOsNavActive(
  pathname: string,
  href: string,
  basePath: HostOsBasePath = "/host",
): boolean {
  if (basePath === "/app/events") {
    // The Events landing sits at the route-group root; Overview and Analytics
    // are siblings below it, so only an exact match may mark Events active.
    if (href === "/app/events") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  if (href === "/host/events") {
    // Events list owns its nested detail routes, but NOT the /host/event wizard.
    return pathname === "/host/events" || pathname.startsWith("/host/events/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Deep links out of the overview body, selected by URL family. */
export const HOST_OS_QUICK_LINKS: Record<
  HostOsBasePath,
  ReadonlyArray<{ href: string; label: string; testId: string }>
> = {
  "/host": [
    { href: "/host/analytics", label: "Open Analytics", testId: "dashboard-open-analytics" },
    { href: "/host/events", label: "View events", testId: "dashboard-open-events" },
    { href: "/host/event/new", label: "Create event", testId: "dashboard-open-new-event" },
  ],
  "/app/events": [
    {
      href: "/app/events/analytics",
      label: "Open Analytics",
      testId: "dashboard-open-analytics",
    },
    { href: "/app/events", label: "View events", testId: "dashboard-open-events" },
    { href: "/app/events/new", label: "Create event", testId: "dashboard-open-new-event" },
  ],
};

/**
 * True when `pathname` should render inside the legacy unified Host OS shell.
 *
 * Only explicitly listed workspace routes get the shell. All other `/host/*`
 * paths (venues, settings, rentals, public marketing landing, the event wizard)
 * stay passthrough — they own their own chrome/provider.
 *
 * Phase-0 shell routes:
 *  - `/host/dashboard`  → Overview workspace
 *  - `/host/events`     → Events list + detail
 *  - `/host/analytics`  → Analytics dashboard
 */
// skipcq: JS-0067, JS-R1005 - ES module export; flat route guards read clearer than a table
export function isHostOsShellRoute(pathname: string): boolean {
  return (
    pathname === "/host/dashboard" || pathname.startsWith("/host/dashboard/") ||
    pathname === "/host/events" || pathname.startsWith("/host/events/") ||
    pathname === "/host/analytics" || pathname.startsWith("/host/analytics/")
  );
}

/**
 * Human label for the route-aware context strip in the shell header. Lets the
 * host always see which workspace they're in even as content swaps underneath.
 * Handles both the legacy `/host/*` routes and `/app/events/*`.
 */
// skipcq: JS-0067, JS-R1005 - ES module export; sequential label matchers kept together
export function deriveHostOsRouteLabel(pathname: string): string {
  if (
    pathname === "/host/dashboard" ||
    pathname.startsWith("/host/dashboard/") ||
    pathname === "/app/events/overview" ||
    pathname.startsWith("/app/events/overview/")
  ) {
    return "Overview";
  }
  if (
    pathname === "/host/event" ||
    pathname.startsWith("/host/event/") ||
    pathname === "/app/events/new" ||
    pathname.startsWith("/app/events/new/")
  ) {
    return "Create event";
  }
  if (
    pathname === "/host/analytics" ||
    pathname.startsWith("/host/analytics/") ||
    pathname === "/app/events/analytics" ||
    pathname.startsWith("/app/events/analytics/")
  ) {
    return "Analytics";
  }
  if (
    pathname === "/app/events" ||
    pathname.startsWith("/app/events/") ||
    pathname.startsWith("/host/events")
  ) {
    return "Events";
  }
  return "Host";
}
