import { describe, expect, it } from "vitest";
import { parseRentalIntelligenceSlots } from "../intelligence-rental-search";
import {
  isRentalRequestable,
  rentalAvailabilityDate,
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

// SAN-1502 — requestability has exactly ONE owner: the database's computed
// `rental_can_request_viewing` column, evaluated under the server-controlled phase.
// The app must not re-derive it from ownership, workflow or availability columns; that
// duplicate rule is what let search, Details and the AI agent drift apart.
describe("isRentalRequestable", () => {
  it("is true only when the database computed the row requestable", () => {
    expect(isRentalRequestable({ rental_can_request_viewing: true })).toBe(true);
  });

  it("is false when the database computed it not requestable", () => {
    expect(isRentalRequestable({ rental_can_request_viewing: false })).toBe(false);
  });

  it("fails closed when the computed column is absent, null or undefined", () => {
    expect(isRentalRequestable({})).toBe(false);
    expect(isRentalRequestable({ rental_can_request_viewing: null })).toBe(false);
    expect(isRentalRequestable({ rental_can_request_viewing: undefined })).toBe(false);
  });
});

// SAN-1349 — the availability calendar must be read in the same timezone the database uses
// (`p1_schedule_tour_atomic` compares `(p_scheduled_at AT TIME ZONE 'America/Bogota')::date`),
// otherwise the app and the database disagree for five hours every day.
describe("rentalAvailabilityDate", () => {
  it("returns the America/Bogota calendar date, not the UTC date", () => {
    expect(rentalAvailabilityDate(new Date("2026-09-28T02:00:00Z"))).toBe("2026-09-27");
  });

  it("returns the local date once Bogota has passed midnight", () => {
    expect(rentalAvailabilityDate(new Date("2026-09-28T06:00:00Z"))).toBe("2026-09-28");
  });

  it("formats as zero-padded YYYY-MM-DD for direct Postgres DATE comparison", () => {
    expect(rentalAvailabilityDate(new Date("2026-01-05T15:00:00Z"))).toBe("2026-01-05");
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
