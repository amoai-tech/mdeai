import { describe, expect, it } from "vitest";
import { parseRentalIntelligenceSlots } from "../intelligence-rental-search";
import {
  isAvailableForStay,
  isRentalRequestable,
  sortForMonthlyStay,
} from "../../tools/search-rentals";
import type { Rental } from "../../tools/search-rentals";

describe("parseRentalIntelligenceSlots", () => {
  it("extracts nomad + Laureles from hero query", () => {
    const slots = parseRentalIntelligenceSlots(
      "Find a quiet digital nomad rental in Laureles near cafes",
    );
    expect(slots.neighborhood).toBe("Laureles");
    expect(slots.wantsNomad).toBe(true);
    expect(slots.wantsQuiet).toBe(true);
    expect(slots.wantsCafe).toBe(true);
  });

  it("extracts monthly Poblado intent", () => {
    const slots = parseRentalIntelligenceSlots("monthly stay in El Poblado");
    expect(slots.neighborhood).toBe("El Poblado");
    expect(slots.wantsMonthly).toBe(true);
  });

  it("extracts gym + cafe proximity", () => {
    const slots = parseRentalIntelligenceSlots(
      "quiet rental in Laureles near cafes and gyms",
    );
    expect(slots.wantsQuiet).toBe(true);
    expect(slots.wantsGym).toBe(true);
    expect(slots.wantsCafe).toBe(true);
  });
});

describe("isAvailableForStay", () => {
  it("passes when both available_from and available_to are null (always available)", () => {
    expect(isAvailableForStay({ available_from: null, available_to: null }, "2026-06-01", "2026-06-30")).toBe(true);
  });

  it("passes when no checkIn/checkOut requested", () => {
    expect(isAvailableForStay({ available_from: "2026-07-01", available_to: "2026-08-31" })).toBe(true);
  });

  it("filters out listing whose window ends before checkIn", () => {
    // available_to 2026-05-31 < checkIn 2026-06-01 → unavailable
    expect(isAvailableForStay(
      { available_from: "2026-05-01", available_to: "2026-05-31" },
      "2026-06-01", "2026-06-30",
    )).toBe(false);
  });

  it("filters out listing whose window starts after checkOut", () => {
    // available_from 2026-07-01 > checkOut 2026-06-30 → unavailable
    expect(isAvailableForStay(
      { available_from: "2026-07-01", available_to: "2026-08-31" },
      "2026-06-01", "2026-06-30",
    )).toBe(false);
  });

  it("passes a listing that overlaps the stay window", () => {
    // available Jun 15–Aug 31, stay Jun 1–30 → overlaps
    expect(isAvailableForStay(
      { available_from: "2026-06-15", available_to: "2026-08-31" },
      "2026-06-01", "2026-06-30",
    )).toBe(true);
  });

  it("passes boundary: available_from equals checkOut", () => {
    expect(isAvailableForStay(
      { available_from: "2026-06-30", available_to: null },
      "2026-06-01", "2026-06-30",
    )).toBe(true);
  });

  it("passes boundary: available_to equals checkIn", () => {
    expect(isAvailableForStay(
      { available_from: null, available_to: "2026-06-01" },
      "2026-06-01", "2026-06-30",
    )).toBe(true);
  });

  it("respects checkIn-only (no checkOut)", () => {
    // available_to 2026-05-31 < checkIn 2026-06-15 → unavailable
    expect(isAvailableForStay(
      { available_from: "2026-04-01", available_to: "2026-05-31" },
      "2026-06-15", undefined,
    )).toBe(false);
    // available_to null → open-ended, passes
    expect(isAvailableForStay(
      { available_from: "2026-06-01", available_to: null },
      "2026-06-15", undefined,
    )).toBe(true);
  });

  it("respects checkOut-only (no checkIn)", () => {
    // available_from 2026-07-01 > checkOut 2026-06-30 → unavailable
    expect(isAvailableForStay(
      { available_from: "2026-07-01", available_to: "2026-08-31" },
      undefined, "2026-06-30",
    )).toBe(false);
    // available_from null → open start, passes
    expect(isAvailableForStay(
      { available_from: null, available_to: "2026-08-31" },
      undefined, "2026-06-30",
    )).toBe(true);
  });
});

// SAN-1349 — the application-side mirror of the database's new-request eligibility rule.
// The database remains the authority; these cases pin the contract the UI and agents rely on.
describe("isRentalRequestable", () => {
  const owned = {
    landlord_id: "11111111-1111-4111-8111-111111111111",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
    available_from: null,
    available_to: null,
  };
  const today = new Date("2026-09-27T12:00:00Z");

  it("allows an owned, active, approved, published, available listing", () => {
    expect(isRentalRequestable(owned, today)).toBe(true);
  });

  it("refuses a listing with no canonical owner", () => {
    expect(isRentalRequestable({ ...owned, landlord_id: null }, today)).toBe(false);
  });

  it("refuses an unapproved listing", () => {
    expect(isRentalRequestable({ ...owned, moderation_status: "pending" }, today)).toBe(false);
  });

  it("refuses an unpublished listing", () => {
    expect(isRentalRequestable({ ...owned, listing_workflow_status: "draft" }, today)).toBe(false);
  });

  it("refuses an inactive listing", () => {
    expect(isRentalRequestable({ ...owned, status: "inactive" }, today)).toBe(false);
  });

  it("refuses a listing whose availability window has already closed", () => {
    expect(isRentalRequestable({ ...owned, available_to: "2026-01-01" }, today)).toBe(false);
  });

  it("refuses a listing that is not available yet", () => {
    expect(isRentalRequestable({ ...owned, available_from: "2027-01-01" }, today)).toBe(false);
  });

  it("allows a listing whose availability window is currently open", () => {
    expect(
      isRentalRequestable(
        { ...owned, available_from: "2026-01-01", available_to: "2026-12-31" },
        today,
      ),
    ).toBe(true);
  });

  it("fails closed when ownership/workflow proof is entirely absent", () => {
    expect(isRentalRequestable({}, today)).toBe(false);
  });
});

// Minimal Rental stub for sort tests
function makeRental(id: string, nightly: number, tags: string[]): Rental {
  return {
    id,
    title: id,
    neighborhood: "Laureles",
    nightly_price: nightly,
    currency: "USD",
    bedrooms: 1,
    wifi: true,
    amenities: [],
    image: "",
    source_url: "",
    can_schedule_viewing: false,
    schedule_viewing_url: null,
    host_name: "Host",
    availability: "Available now",
    tags,
  };
}

describe("sortForMonthlyStay", () => {
  it("long-stay listings rank before short-stay regardless of price", () => {
    const cheap = makeRental("cheap-short", 40, []);
    const expLong = makeRental("exp-long", 90, ["long-stay"]);
    const sorted = sortForMonthlyStay([cheap, expLong]);
    expect(sorted[0].id).toBe("exp-long");
  });

  it("within same long-stay tier, cheaper ranks first", () => {
    const a = makeRental("a", 70, ["long-stay"]);
    const b = makeRental("b", 50, ["long-stay"]);
    const sorted = sortForMonthlyStay([a, b]);
    expect(sorted[0].id).toBe("b");
  });

  it("within short-stay tier, cheaper ranks first", () => {
    const a = makeRental("a", 80, []);
    const b = makeRental("b", 60, []);
    const sorted = sortForMonthlyStay([a, b]);
    expect(sorted[0].id).toBe("b");
  });

  it("preserves original array (returns a new sorted copy)", () => {
    const orig = [makeRental("a", 80, []), makeRental("b", 60, ["long-stay"])];
    const sorted = sortForMonthlyStay(orig);
    expect(sorted).not.toBe(orig);
    expect(orig[0].id).toBe("a"); // unchanged
  });

  it("works with IntelligenceRentalResult (generic preserves extra fields)", () => {
    type IResult = Rental & { rankScore?: number };
    const a: IResult = { ...makeRental("a", 80, []), rankScore: 0.9 };
    const b: IResult = { ...makeRental("b", 60, ["long-stay"]), rankScore: 0.5 };
    const sorted = sortForMonthlyStay<IResult>([a, b]);
    expect(sorted[0].id).toBe("b");
    expect(sorted[0].rankScore).toBe(0.5);
  });
});

// Pass-through test lives in a separate file (search-rentals-date-passthrough.test.ts)
// where vi.mock can be hoisted before any module caching occurs.
