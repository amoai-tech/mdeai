import { describe, expect, it } from "vitest";
import { applyAvailabilityFilters } from "@/lib/rentals/availability-filter";
import { isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";

/** A fake PostgREST builder that records every filter call, in order. */
function recorder() {
  const calls: string[] = [];
  const builder = {
    or: (f: string) => { calls.push(`or(${f})`); return builder; },
    not: (c: string, o: string, v: unknown) => { calls.push(`not(${c},${o},${String(v)})`); return builder; },
  };
  return { builder, calls };
}
const run = (opts: { checkIn?: string; checkOut?: string }) => {
  const { builder, calls } = recorder();
  applyAvailabilityFilters(builder, { ...opts, today: "2026-10-13" });
  return calls;
};

describe("applyAvailabilityFilters — one rule for every search path (SAN-486)", () => {
  it("never lets a listing with no move-in date through, with or without dates", () => {
    for (const calls of [run({}), run({ checkIn: "2026-11-01", checkOut: "2026-11-30" }), run({ checkIn: "2026-11-01" })]) {
      expect(calls[0]).toBe("not(available_from,is,null)");
      expect(calls.some((c) => c.includes("available_from.is.null"))).toBe(false);
    }
  });

  it("with no dates it only excludes expired listings (a future move-in stays discoverable)", () => {
    expect(run({})).toEqual(["not(available_from,is,null)", "or(available_to.is.null,available_to.gte.2026-10-13)"]);
  });

  it("with a full stay (Nov 1–30 inclusive = 30 days) it requires the listing to start on or before the first day and cover the last day and the length", () => {
    expect(run({ checkIn: "2026-11-01", checkOut: "2026-11-30" })).toEqual([
      "not(available_from,is,null)",
      "or(available_from.lte.2026-11-01)",
      "or(available_to.is.null,available_to.gte.2026-11-30)",
      "or(minimum_stay_days.is.null,minimum_stay_days.lte.30)",
      "or(maximum_stay_days.is.null,maximum_stay_days.gte.30)",
    ]);
  });

  it("with only one date it uses that day as both ends and skips the length rule", () => {
    expect(run({ checkIn: "2026-11-01" })).toEqual([
      "not(available_from,is,null)",
      "or(available_from.lte.2026-11-01)",
      "or(available_to.is.null,available_to.gte.2026-11-01)",
    ]);
  });
});

describe("calendar date validation (SAN-486)", () => {
  it.each(["2026-02-31", "2026-13-01", "2026-00-10", "2026-04-31", "2026-1-5", "tomorrow", ""])("rejects %j", (d) => {
    expect(isRealCalendarDate(d)).toBe(false);
  });
  it.each(["2026-10-13", "2024-02-29", "2026-12-31"])("accepts %j", (d) => {
    expect(isRealCalendarDate(d)).toBe(true);
  });
  it("2026-02-29 is not a real date (2026 is not a leap year)", () => {
    expect(isRealCalendarDate("2026-02-29")).toBe(false);
  });
  it("a stay is reversed only when check-out is before check-in", () => {
    expect(isOrderedStay("2026-11-30", "2026-11-01")).toBe(false);
    expect(isOrderedStay("2026-11-01", "2026-11-30")).toBe(true);
    expect(isOrderedStay("2026-11-01", "2026-11-01")).toBe(true);
    expect(isOrderedStay("2026-11-01", undefined)).toBe(true);
  });
});
