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
      "/me/tickets",
      "/partners/profile",
      "/host",
      "/host/rentals",
      "/host/rentals/listings",
    ]) {
      expect(isAgentlessRoute(pathname), pathname).toBe(false);
    }
  });
});
