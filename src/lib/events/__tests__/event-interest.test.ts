import { describe, expect, it } from "vitest";
import { interestOutcome, isEventId } from "../event-interest";

describe("SAN-1620 S4 — a follow is consent, and retrying it is harmless", () => {
  it("accepts a real event id only", () => {
    expect(isEventId("a1b2c3d4-0001-0001-0001-000000000003")).toBe(true);
    expect(isEventId("not-an-id")).toBe(false);
    expect(isEventId(null)).toBe(false);
  });

  it("treats a duplicate follow as success, not an error", () => {
    expect(interestOutcome(true, { code: "23505" })).toEqual({ ok: true, following: true });
  });

  it("reports a genuine failure instead of showing a false Following state", () => {
    expect(interestOutcome(true, { code: "42501" })).toEqual({ ok: false, error: "failed" });
  });

  it("confirms unfollow on success", () => {
    expect(interestOutcome(false, null)).toEqual({ ok: true, following: false });
  });
});
