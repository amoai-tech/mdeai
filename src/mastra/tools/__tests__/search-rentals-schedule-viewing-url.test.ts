/**
 * SAN-478 — `schedule_viewing_url` must point at a page that exists.
 *
 * The rental and concierge agents are instructed to *print this URL to the user*
 * (`src/mastra/agents/rental-agent.ts`, `src/mastra/agents/concierge.ts`), and
 * `get-rental-detail` treats it as part of the requestability proof. It previously pointed at
 * `…/rentals/<id>/schedule-viewing`, which has never had a route behind it — so the agents
 * were handing renters a 404 and the field was advertising a destination that did not exist.
 *
 * It now points at the MDE listing detail page, which is where the viewing modal lives and
 * which resolves by id or slug. These tests pin that, because the failure mode was a valid-
 * looking URL rather than a crash.
 */
import { describe, expect, it } from "vitest";
import { isRentalRequestable, rowToRental, type ApartmentRow } from "@/mastra/tools/search-rentals";

function apartmentRow(overrides: Partial<ApartmentRow> = {}): ApartmentRow {
  return {
    id: "d9e96fb4-2adf-4bb3-99d6-70c0692b6bb8",
    title: "Calle 10 #42-15, Laureles",
    neighborhood: "Laureles",
    bedrooms: 2,
    price_daily: null,
    price_monthly: 2_400_000,
    currency: "COP",
    wifi_speed: null,
    amenities: [],
    images: [],
    host_name: null,
    source_url: null,
    available_from: null,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    slug: null,
    latitude: null,
    longitude: null,
    // Requestable baseline: canonical owner + active + approved + published.
    landlord_id: "c2cd8821-679b-408b-939a-3e77ba568c3c",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
    ...overrides,
  };
}

describe("schedule_viewing_url — SAN-478 resolves to a real page", () => {
  it("points a requestable listing at its detail page", () => {
    const rental = rowToRental(apartmentRow({ slug: "laureles-2br-balcony" }));
    expect(rental.can_schedule_viewing).toBe(true);
    expect(rental.schedule_viewing_url).toBe("https://mdeai.co/rentals/laureles-2br-balcony");
  });

  it("falls back to the id when the listing has no slug", () => {
    const rental = rowToRental(apartmentRow({ slug: null }));
    expect(rental.schedule_viewing_url).toBe(
      "https://mdeai.co/rentals/d9e96fb4-2adf-4bb3-99d6-70c0692b6bb8",
    );
  });

  it("never emits the dead /schedule-viewing path", () => {
    const rental = rowToRental(apartmentRow({ slug: "laureles-2br-balcony" }));
    expect(rental.schedule_viewing_url).not.toContain("schedule-viewing");
  });

  it("stays null for a listing with no canonical owner", () => {
    const row = apartmentRow({ landlord_id: null });
    expect(isRentalRequestable(row)).toBe(false);
    const rental = rowToRental(row);
    expect(rental.can_schedule_viewing).toBe(false);
    expect(rental.schedule_viewing_url).toBeNull();
  });

  it("stays null for an unpublished listing", () => {
    const row = apartmentRow({ listing_workflow_status: "draft" });
    expect(isRentalRequestable(row)).toBe(false);
    expect(rowToRental(row).schedule_viewing_url).toBeNull();
  });

  it("stays null for an unapproved listing", () => {
    const row = apartmentRow({ moderation_status: "pending" });
    expect(isRentalRequestable(row)).toBe(false);
    expect(rowToRental(row).schedule_viewing_url).toBeNull();
  });
});
