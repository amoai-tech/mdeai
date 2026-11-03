import { describe, expect, it } from "vitest";
import { formatMedellinBookingTime, medellinLocalToIso, medellinIsoToLocal } from "./venue-booking-time";
describe("venue local time", () => {
  it("keeps Medellín wall clock invariant regardless of browser timezone", () => {
    expect(medellinLocalToIso("2026-11-15T19:00")).toBe("2026-11-16T00:00:00.000Z");
    expect(medellinIsoToLocal("2026-11-16T00:00:00.000Z")).toBe("2026-11-15T19:00");
    expect(formatMedellinBookingTime("2026-11-16T00:00:00.000Z")).toContain("7:00 PM");
  });
  it("rejects impossible dates rather than shifting them silently", () => {
    expect(() => medellinLocalToIso("2026-02-30T19:00")).toThrow();
    expect(() => medellinLocalToIso("2026-11-15T25:00")).toThrow();
  });
});
