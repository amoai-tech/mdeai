// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import {
  saveVenueBookingReview, restoreVenueBookingReview, clearVenueBookingReview,
} from "./venue-booking-draft-store";
import type { VenueBookingHitlArgs } from "./venue-booking-hitl-panel";

const draft: VenueBookingHitlArgs = {
  venueKind: "restaurant",
  restaurantId: "a1b2c3d4-e5f6-4789-abcd-100000000005",
  requestedAt: "2026-11-16T00:00:00.000Z", partySize: 2,
  contactName: "Maria", contactEmail: "maria@example.com", venueTitle: "Verdeo",
};
afterEach(() => { vi.useRealTimers(); clearVenueBookingReview(); });

describe("review draft restoration after sign-in", () => {
  it("keeps the same validated draft in sessionStorage, not in the URL", () => {
    saveVenueBookingReview(draft);
    expect(restoreVenueBookingReview()).toMatchObject(draft);
  });
  it("clears invalid or expired proposals", () => {
    sessionStorage.setItem("mde.venue-booking.review", "broken");
    expect(restoreVenueBookingReview()).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));
    saveVenueBookingReview(draft);
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(restoreVenueBookingReview()).toBeNull();
  });
});
