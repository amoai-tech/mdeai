import { describe, expect, it } from "vitest";
import {
  activeWorkspaceContext,
  buildWorkspaceContexts,
  type WorkspaceSignals,
} from "@/lib/app/workspace-contexts";

const EMPTY: WorkspaceSignals = {
  hasLandlordProfile: false,
  partnerLabels: [],
  isAdmin: false,
};

describe("buildWorkspaceContexts", () => {
  it("always offers Personal and Events creation to a signed-in account", () => {
    const contexts = buildWorkspaceContexts(EMPTY);
    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toMatchObject({ kind: "personal", href: "/app/me" });
    expect(contexts[1]).toMatchObject({ kind: "events", href: "/app/events" });
  });

  it("keeps private business workspaces in a stable order", () => {
    const contexts = buildWorkspaceContexts({
      hasLandlordProfile: true,
      partnerLabels: ["Cafe Roma"],
      isAdmin: true,
    });
    expect(contexts.map((context) => context.kind)).toEqual([
      "personal",
      "rentals",
      "events",
      "partners",
      "team",
    ]);
  });

  it("uses the business name for one partner and a neutral label for many", () => {
    expect(
      buildWorkspaceContexts({ ...EMPTY, partnerLabels: ["Cafe Roma"] })[2]
        .label,
    ).toBe("Cafe Roma");
    expect(
      buildWorkspaceContexts({
        ...EMPTY,
        partnerLabels: ["Cafe Roma", "Roma Norte"],
      })[2].label,
    ).toBe("Partners");
  });

  it("links only destinations that exist today", () => {
    const contexts = buildWorkspaceContexts({
      hasLandlordProfile: true,
      hasOrganizerEvents: true,
      partnerLabels: ["Cafe Roma"],
      isAdmin: true,
    });
    expect(contexts.map((context) => context.href)).toEqual([
      "/app/me",
      "/app/rentals",
      "/app/events",
      "/app/partners/profile",
      "/app/contests",
    ]);
    // Personal (SAN-1576), Rentals (SAN-1578), Events (SAN-1577), Partners
    // (SAN-1579) and Team contests (SAN-1580) are proven /app adapters.
    expect(contexts[0].href).toBe("/app/me");
    expect(contexts[1].href).toBe("/app/rentals");
    expect(contexts[2].href).toBe("/app/events");
    expect(contexts[3].href).toBe("/app/partners/profile");
    expect(contexts[4].href).toBe("/app/contests");
  });
});

describe("activeWorkspaceContext", () => {
  const contexts = buildWorkspaceContexts({
    hasLandlordProfile: true,
    hasOrganizerEvents: true,
    partnerLabels: ["Cafe Roma"],
    isAdmin: true,
  });

  it("matches a destination and its subpaths", () => {
    expect(activeWorkspaceContext("/saved", contexts)?.kind).toBe("personal");
    expect(activeWorkspaceContext("/app/rentals/listings", contexts)?.kind).toBe(
      "rentals",
    );
    expect(activeWorkspaceContext("/admin/contests/123", contexts)?.kind).toBe(
      "team",
    );
  });

  it("treats the wallet list as Personal", () => {
    expect(activeWorkspaceContext("/me/tickets", contexts)?.kind).toBe(
      "personal",
    );
    expect(activeWorkspaceContext("/me/tickets/abc", contexts)?.kind).toBe(
      "personal",
    );
  });

  it("recognises the future /app routes without granting a workspace", () => {
    expect(activeWorkspaceContext("/app", contexts)?.kind).toBe("personal");
    expect(activeWorkspaceContext("/app/me/saved", contexts)?.kind).toBe(
      "personal",
    );
    expect(activeWorkspaceContext("/app/me/tickets", contexts)?.kind).toBe(
      "personal",
    );
    expect(activeWorkspaceContext("/app/rentals", contexts)?.kind).toBe(
      "rentals",
    );
    expect(activeWorkspaceContext("/app/events", contexts)?.kind).toBe(
      "events",
    );
    expect(activeWorkspaceContext("/app/events/overview", contexts)?.kind).toBe(
      "events",
    );
    expect(activeWorkspaceContext("/app/events/analytics", contexts)?.kind).toBe(
      "events",
    );
    expect(activeWorkspaceContext("/app/events/new", contexts)?.kind).toBe(
      "events",
    );
    expect(activeWorkspaceContext("/app/partners/profile", contexts)?.kind).toBe(
      "partners",
    );
    expect(activeWorkspaceContext("/app/contests", contexts)?.kind).toBe("team");
    expect(activeWorkspaceContext("/app/unknown", contexts)).toBeNull();
  });

  it("keeps legacy Host OS URLs as Events aliases", () => {
    for (const pathname of [
      "/host/dashboard",
      "/host/events",
      "/host/events/draft-123",
      "/host/analytics",
      "/host/event/new",
    ]) {
      expect(activeWorkspaceContext(pathname, contexts)?.kind, pathname).toBe(
        "events",
      );
    }
  });

  it("returns null for an unrelated public route", () => {
    expect(activeWorkspaceContext("/rentals", contexts)).toBeNull();
  });
});
