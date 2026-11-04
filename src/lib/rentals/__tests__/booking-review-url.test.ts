import { describe, expect, it } from "vitest";
import { bookingReviewHref, moveOutFromStayThrough, parseStayRange } from "../booking-review-url";

const ID = "7beb9ede-f253-4f24-baeb-ae10a7c93a9d";

describe("parseStayRange", () => {
  it("keeps a real, ordered stay", () => {
    expect(parseStayRange({ from: "2026-11-10", through: "2026-11-15" })).toEqual({
      from: "2026-11-10",
      through: "2026-11-15",
    });
  });

  it("keeps a lone move-in date (a renter who only knows when they move in)", () => {
    expect(parseStayRange({ from: "2026-11-10" })).toEqual({ from: "2026-11-10", through: null });
  });

  it("drops an impossible calendar date instead of silently correcting it", () => {
    expect(parseStayRange({ from: "2026-02-31", through: "2026-03-05" })).toEqual({
      from: null,
      through: null,
    });
  });

  it("treats a reversed range as unusable instead of quietly keeping the move-in", () => {
    // Dropping only the bad end would turn a two-date stay into a one-date one, which is a
    // different booking. The review screen must prefill nothing and let the renter choose again.
    expect(parseStayRange({ from: "2026-11-30", through: "2026-11-01" })).toEqual({
      from: null,
      through: null,
    });
  });

  it("ignores a move-out with no move-in", () => {
    expect(parseStayRange({ through: "2026-11-15" })).toEqual({ from: null, through: null });
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseStayRange({ from: ["2026-11-10", "2026-12-01"], through: ["2026-11-15"] })).toEqual({
      from: "2026-11-10",
      through: "2026-11-15",
    });
  });

  it("treats blank and missing values as no stay", () => {
    expect(parseStayRange({ from: "  ", through: "" })).toEqual({ from: null, through: null });
    expect(parseStayRange({})).toEqual({ from: null, through: null });
  });
});

describe("bookingReviewHref", () => {
  it("carries the whole stay", () => {
    expect(bookingReviewHref(ID, { from: "2026-11-10", through: "2026-11-15" })).toBe(
      `/rentals/bookings/new?apartment=${ID}&from=2026-11-10&through=2026-11-15`,
    );
  });

  it("carries a move-in date on its own", () => {
    expect(bookingReviewHref(ID, { from: "2026-11-10", through: null })).toBe(
      `/rentals/bookings/new?apartment=${ID}&from=2026-11-10`,
    );
  });

  it("refuses to build a link from a reversed range", () => {
    expect(bookingReviewHref(ID, { from: "2026-11-30", through: "2026-11-01" })).toBe(
      `/rentals/bookings/new?apartment=${ID}`,
    );
  });

  it("refuses to build a link from an impossible date", () => {
    expect(bookingReviewHref(ID, { from: "2026-02-31", through: "2026-03-05" })).toBe(
      `/rentals/bookings/new?apartment=${ID}`,
    );
  });

  it("falls back to the apartment alone when there is no stay", () => {
    expect(bookingReviewHref(ID, null)).toBe(`/rentals/bookings/new?apartment=${ID}`);
    expect(bookingReviewHref(ID, { from: null, through: null })).toBe(
      `/rentals/bookings/new?apartment=${ID}`,
    );
  });
});

describe("moveOutFromStayThrough — the one date conversion", () => {
  it("is the calendar day after the last occupied day", () => {
    // Nov 10-15 is a six-day stay, so the renter leaves on the 16th, not the 15th.
    expect(moveOutFromStayThrough("2026-11-15")).toBe("2026-11-16");
  });

  it("crosses a month boundary", () => {
    expect(moveOutFromStayThrough("2026-11-30")).toBe("2026-12-01");
  });

  it("crosses a year boundary", () => {
    expect(moveOutFromStayThrough("2026-12-31")).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(moveOutFromStayThrough("2028-02-28")).toBe("2028-02-29");
  });

  it("returns null for a missing or impossible date", () => {
    expect(moveOutFromStayThrough(null)).toBeNull();
    expect(moveOutFromStayThrough("2026-02-31")).toBeNull();
  });
});
