import { describe, expect, it } from "vitest";
import { readyVenueBookingHitlArgs } from "./venue-booking-hitl-input";

const complete = {
  venueKind: "restaurant" as const,
  restaurantId: "a1b2c3d4-e5f6-4789-abcd-100000000005",
  requestedAt: "2026-11-15T19:00:00-05:00",
  partySize: 2,
  contactName: "Maria",
  contactEmail: "maria@example.com",
};

describe("CopilotKit venue-booking tool-argument lifecycle", () => {
  it("never shows consent controls while arguments are still streaming, even if temporarily valid", () => {
    expect(readyVenueBookingHitlArgs(complete, "inProgress")).toBeNull();
  });
  it("does not show review/Send while a required field is missing", () => {
    const { partySize: _missing, ...incomplete } = complete;
    void _missing;
    expect(readyVenueBookingHitlArgs(incomplete, "executing")).toBeNull();
    expect(readyVenueBookingHitlArgs({ ...complete, contactEmail: "" }, "executing")).toBeNull();
  });
  it("shows the validated UTC appointment only once CopilotKit reaches executing", () => {
    expect(readyVenueBookingHitlArgs(complete, "executing")).toEqual(expect.objectContaining({
      restaurantId: complete.restaurantId, partySize: 2,
      requestedAt: "2026-11-16T00:00:00.000Z",
    }));
  });
  it("still permits the saved result to render after the tool completes", () => {
    expect(readyVenueBookingHitlArgs(complete, "complete")?.contactEmail).toBe("maria@example.com");
  });
});
