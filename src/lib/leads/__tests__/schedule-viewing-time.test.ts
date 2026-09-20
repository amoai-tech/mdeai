import { describe, expect, it } from "vitest";
import {
  LISTING_TIME_ZONE,
  isFutureInstant,
  resolvePreferredAtInstant,
} from "@/lib/leads/schedule-viewing-time";

/**
 * SAN-1203 · Improvement 2 — the browser `datetime-local` control emits a wall
 * clock with no offset. Interpreting it with the browser's own timezone (or the
 * Vercel process timezone) makes the same typed value mean different instants
 * for different users. These tests pin the canonical contract: a wall-clock
 * value always resolves through the listing timezone.
 */
describe("schedule-viewing-time (SAN-1203 timezone contract)", () => {
  it("uses the listing timezone, not the process timezone", () => {
    expect(LISTING_TIME_ZONE).toBe("America/Bogota");
  });

  it("interprets a wall clock as listing-local time", () => {
    // Colombia is UTC-05:00 year round (no DST since 1993).
    expect(resolvePreferredAtInstant("2026-11-03T15:00")).toBe(
      "2026-11-03T20:00:00.000Z",
    );
  });

  it("resolves the same wall clock to the same instant regardless of seconds precision", () => {
    expect(resolvePreferredAtInstant("2026-11-03T15:00")).toBe(
      resolvePreferredAtInstant("2026-11-03T15:00:00"),
    );
  });

  it("treats midnight as the start of the listing-local day", () => {
    expect(resolvePreferredAtInstant("2026-11-03T00:00")).toBe(
      "2026-11-03T05:00:00.000Z",
    );
  });

  it("returns null for malformed or zoned input", () => {
    for (const bad of [
      "",
      "   ",
      "2026-11-03",
      "2026-11-03T15",
      "15:00",
      "2026-11-03T15:00:00.000Z",
      "2026-11-03T15:00-05:00",
      "not-a-date",
    ]) {
      expect(resolvePreferredAtInstant(bad), bad).toBeNull();
    }
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(resolvePreferredAtInstant("2026-02-30T10:00")).toBeNull();
    expect(resolvePreferredAtInstant("2026-13-01T10:00")).toBeNull();
    expect(resolvePreferredAtInstant("2026-11-03T25:00")).toBeNull();
  });

  it("compares future instants against an explicit now", () => {
    const now = new Date("2026-11-03T19:00:00.000Z");
    expect(isFutureInstant("2026-11-03T20:00:00.000Z", now)).toBe(true);
    expect(isFutureInstant("2026-11-03T19:00:00.000Z", now)).toBe(false);
    expect(isFutureInstant("2026-11-03T18:59:59.000Z", now)).toBe(false);
  });

  it("keeps a same-day viewing that is still ahead in listing-local time", () => {
    // 14:00 Bogota on 2026-11-03 is 19:00Z; a request made at 18:00Z is future.
    const instant = resolvePreferredAtInstant("2026-11-03T14:00");
    expect(instant).toBe("2026-11-03T19:00:00.000Z");
    expect(isFutureInstant(instant as string, new Date("2026-11-03T18:00:00.000Z"))).toBe(true);
  });
});
