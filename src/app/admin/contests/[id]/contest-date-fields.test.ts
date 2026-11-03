import { describe, expect, it } from "vitest";
import { parseLocalInput, toLocalInput, toUtcIso } from "./contest-date-fields";

describe("contest date conversion", () => {
  it("reads a datetime-local value as the admin wall clock", () => {
    expect(parseLocalInput("2026-11-01T10:00")).toEqual({
      year: 2026, month: 10, day: 1, hour: 10, minute: 0,
    });
    expect(parseLocalInput("")).toBeNull();
    expect(parseLocalInput("not-a-date")).toBeNull();
  });

  it("round-trips local wall clock through UTC", () => {
    const iso = toUtcIso("2026-11-01T10:00");
    const back = new Date(iso);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(10);
    expect(back.getDate()).toBe(1);
    expect(back.getHours()).toBe(10);
    expect(back.getMinutes()).toBe(0);
  });

  it("never invents a date from a malformed value", () => {
    expect(toUtcIso("")).toBe("");
    expect(toUtcIso("not-a-date")).toBe("");
  });

  it("converts UTC back to the same wall clock for display", () => {
    const iso = toUtcIso("2026-11-01T10:00");
    expect(toLocalInput(iso)).toBe("2026-11-01T10:00");
  });
});