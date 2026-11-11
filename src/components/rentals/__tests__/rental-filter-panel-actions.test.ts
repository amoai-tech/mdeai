import { describe, expect, it } from "vitest";
import { decideApply } from "../rental-filter-panel-actions";

describe("SAN-1655 Apply guards", () => {
  it("refuses a duplicate click while a navigation is in flight", () => {
    const result = decideApply({ inFlight: true, currentUrl: "/rentals?a=1", nextUrl: "/rentals?beds=1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already in progress/i);
  });

  it("refuses a value the URL already has", () => {
    const result = decideApply({ inFlight: false, currentUrl: "/rentals?beds=1", nextUrl: "/rentals?beds=1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already applied/i);
  });

  it("allows one real change", () => {
    expect(decideApply({ inFlight: false, currentUrl: "/rentals?beds=1", nextUrl: "/rentals?beds=2" })).toEqual({ ok: true });
  });
});
