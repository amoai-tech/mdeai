/**
 * SAN-1575 — the workspace contract shared by the /app shell and every adapter.
 *
 * A workspace is a *destination*, never a permission. Selecting one only chooses
 * which already-authorized page to open; Supabase RLS and the destination's own
 * server guard remain the authority.
 *
 * Adapter tasks (SAN-1576 … SAN-1580) flip their own entry to the /app route
 * once parity is proven. Legacy URLs remain valid aliases for the same
 * workspace; they are never a second permission path.
 */

export const WORKSPACE_KINDS = [
  "personal",
  "rentals",
  "events",
  "partners",
  "team",
] as const;

export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export type WorkspaceContext = {
  kind: WorkspaceKind;
  label: string;
  description: string;
  /** Current working destination. Swapped to /app/... only after parity. */
  href: string;
};

export type WorkspaceSignals = {
  hasLandlordProfile: boolean;
  hasOrganizerEvents: boolean;
  /** Business names for authorized partner memberships; empty when none. */
  partnerLabels: string[];
  isAdmin: boolean;
};

const PERSONAL: WorkspaceContext = {
  kind: "personal",
  label: "Personal",
  description: "Tickets, saved places, and your account.",
  href: "/app/me",
};

/**
 * Build the switcher/card list in a stable order: Personal first, then the
 * business contexts in the same order every time. Pure, so it is unit-tested
 * without Supabase.
 */
export function buildWorkspaceContexts(
  signals: WorkspaceSignals,
): WorkspaceContext[] {
  const contexts: WorkspaceContext[] = [PERSONAL];

  if (signals.hasLandlordProfile) {
    contexts.push({
      kind: "rentals",
      label: "Rentals",
      description: "Listings, leads, and viewing requests.",
      href: "/app/rentals",
    });
  }

  if (signals.hasOrganizerEvents) {
    contexts.push({
      kind: "events",
      label: "Events",
      description: "Your events, sales, and analytics.",
      href: "/app/events",
    });
  }

  if (signals.partnerLabels.length > 0) {
    contexts.push({
      kind: "partners",
      label:
        signals.partnerLabels.length === 1
          ? signals.partnerLabels[0]
          : "Partners",
      description: "Business profile and partner details.",
      // SAN-1579: /app/partners/profile reuses the legacy editor, so the
      // workspace destination follows the account shell. /partners/profile
      // remains a supported legacy URL.
      href: "/app/partners/profile",
    });
  }

  if (signals.isAdmin) {
    contexts.push({
      kind: "team",
      label: "MDE Team",
      description: "Contests and protected admin operations.",
      href: "/app/contests",
    });
  }

  return contexts;
}

/**
 * Which workspace does this path belong to? Uses the destination href first,
 * then the known aliases that a destination owns (for example the wallet list
 * lives under /me/tickets while Personal links to /saved).
 */
export function activeWorkspaceContext(
  pathname: string,
  contexts: WorkspaceContext[],
): WorkspaceContext | null {
  const byHref = contexts.find(
    (context) =>
      pathname === context.href || pathname.startsWith(`${context.href}/`),
  );
  if (byHref) return byHref;

  if (
    pathname === "/saved" ||
    pathname === "/me/tickets" ||
    pathname.startsWith("/me/tickets/")
  ) {
    return contexts.find((context) => context.kind === "personal") ?? null;
  }

  // SAN-1580: the legacy contest admin URLs remain valid and belong to Team.
  if (pathname === "/admin/contests" || pathname.startsWith("/admin/contests/")) {
    return contexts.find((context) => context.kind === "team") ?? null;
  }

  // SAN-1577: the legacy Host OS URLs remain valid aliases for Events, so the
  // switcher still shows Events when an existing link/bookmark lands there.
  if (
    pathname === "/host/dashboard" ||
    pathname.startsWith("/host/dashboard/") ||
    pathname === "/host/events" ||
    pathname.startsWith("/host/events/") ||
    pathname === "/host/analytics" ||
    pathname.startsWith("/host/analytics/") ||
    pathname === "/host/event" ||
    pathname.startsWith("/host/event/")
  ) {
    return contexts.find((context) => context.kind === "events") ?? null;
  }

  if (pathname === "/app") {
    return contexts.find((context) => context.kind === "personal") ?? null;
  }

  if (pathname.startsWith("/app/")) {
    if (pathname.startsWith("/app/me")) {
      return contexts.find((context) => context.kind === "personal") ?? null;
    }
    if (pathname.startsWith("/app/rentals")) {
      return contexts.find((context) => context.kind === "rentals") ?? null;
    }
    if (pathname.startsWith("/app/events")) {
      return contexts.find((context) => context.kind === "events") ?? null;
    }
    if (pathname.startsWith("/app/partners")) {
      return contexts.find((context) => context.kind === "partners") ?? null;
    }
    if (pathname.startsWith("/app/contests") || pathname.startsWith("/app/admin")) {
      return contexts.find((context) => context.kind === "team") ?? null;
    }
  }

  return null;
}
