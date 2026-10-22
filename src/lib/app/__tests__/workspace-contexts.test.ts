import { describe, expect, it } from "vitest";
import {
  activeWorkspaceContext,
  buildWorkspaceContexts,
  type WorkspaceSignals,
} from "@/lib/app/workspace-contexts";

const EMPTY: WorkspaceSignals = {
  hasLandlordProfile: false,
  hasOrganizerEvents: false,
  partnerLabels: [],
  isAdmin: false,
};

describe("buildWorkspaceContexts", () => {
  it("always starts with Personal for a signed-in account", () => {
    const contexts = buildWorkspaceContexts(EMPTY);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ kind: "personal", href: "/saved" });
  });

  it("adds only the contexts the account really has, in a stable order", () => {
    const contexts = buildWorkspaceContexts({
      hasLandlordProfile: true,
      hasOrganizerEvents: true,
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
      buildWorkspaceContexts({ ...EMPTY, partnerLabels: ["Cafe Roma"] })[1]
        .label,
    ).toBe("Cafe Roma");
    expect(
      buildWorkspaceContexts({
        ...EMPTY,
        partnerLabels: ["Cafe Roma", "Roma Norte"],
      })[1].label,
    ).toBe("Partners");
  });

  it("links only destinations that exist today (legacy URLs until parity)", () => {
    const contexts = buildWorkspaceContexts({
      hasLandlordProfile: true,
      hasOrganizerEvents: true,
      partnerLabels: ["Cafe Roma"],
      isAdmin: true,
    });
    expect(contexts.map((context) => context.href)).toEqual([
      "/saved",
      "/host/rentals",
      "/host/dashboard",
      "/partners/profile",
      "/admin/contests",
    ]);
    for (const context of contexts) {
      expect(context.href.startsWith("/app")).toBe(false);
    }
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
    expect(activeWorkspaceContext("/host/rentals/listings", contexts)?.kind).toBe(
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
    expect(activeWorkspaceContext("/app/rentals", contexts)?.kind).toBe(
      "rentals",
    );
    expect(activeWorkspaceContext("/app/events/list", contexts)?.kind).toBe(
      "events",
    );
    expect(activeWorkspaceContext("/app/contests", contexts)?.kind).toBe("team");
    expect(activeWorkspaceContext("/app/unknown", contexts)).toBeNull();
  });

  it("returns null for an unrelated public route", () => {
    expect(activeWorkspaceContext("/rentals", contexts)).toBeNull();
  });
});
