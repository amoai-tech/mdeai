import { describe, expect, it } from "vitest";
import { isAgentlessRoute } from "@/lib/copilot/agentless-routes";

describe("isAgentlessRoute", () => {
  it("keeps the account shell off the discovery concierge runtime", () => {
    for (const pathname of [
      "/app",
      "/app/me",
      "/app/me/tickets",
      "/app/rentals",
      "/app/rentals/listings",
      "/app/events",
      "/app/events/list",
      "/app/partners/profile",
      "/app/contests",
      "/app/admin",
    ]) {
      expect(isAgentlessRoute(pathname), pathname).toBe(true);
    }
  });

  it("keeps every route that owns an agent surface excluded", () => {
    for (const pathname of [
      "/login",
      "/signup",
      "/auth/callback",
      "/chat",
      "/host/event",
      "/host/event/new",
      "/host/events",
      "/host/dashboard",
      "/host/analytics",
      "/host/rentals",
      "/host/rentals/listings",
      "/host/rentals/onboarding",
      "/partners/profile",
      "/partners/signup",
      "/me/tickets",
      "/me/tickets/abc",
      "/admin",
      "/admin/contests",
      "/admin/rentals",
      "/admin/event-bookings",
    ]) {
      expect(isAgentlessRoute(pathname), pathname).toBe(true);
    }
  });

  it("leaves discovery routes on the root concierge provider", () => {
    for (const pathname of [
      "/",
      "/rentals",
      "/restaurants",
      "/nightlife",
      "/trips",
      "/saved",
      "/host",
      "/host/rentals-report",
    ]) {
      expect(isAgentlessRoute(pathname), pathname).toBe(false);
    }
  });
});
