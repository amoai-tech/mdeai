import { describe, expect, it } from "vitest";
import { canVoteIn, contestDate, contestState, contestWindowLabel, type PublicContest } from "../contest-state";

const NOW = new Date("2026-10-19T18:00:00.000Z");

function contest(over: Partial<PublicContest> = {}): PublicContest {
  return {
    id: "c1",
    slug: "people-choice",
    title: "People's Choice",
    description: null,
    status: "live",
    startsAt: "2026-10-01T12:00:00.000Z",
    endsAt: "2026-11-01T12:00:00.000Z",
    coverUrl: null,
    ...over,
  };
}

describe("contestState", () => {
  it("is open when live and inside the window", () => {
    expect(contestState(contest(), NOW)).toBe("open");
  });

  it("is upcoming when the start is in the future", () => {
    expect(contestState(contest({ startsAt: "2026-12-01T12:00:00.000Z" }), NOW)).toBe("upcoming");
  });

  it("is closed when the end date has passed, even though the status still says live", () => {
    expect(contestState(contest({ endsAt: "2026-10-10T12:00:00.000Z" }), NOW)).toBe("closed");
  });

  it("is never open while draft, whatever the dates say", () => {
    expect(contestState(contest({ status: "draft" }), NOW)).toBe("draft");
  });

  it("is archived when archived", () => {
    expect(contestState(contest({ status: "archived" }), NOW)).toBe("archived");
  });

  it("is closed when explicitly closed", () => {
    expect(contestState(contest({ status: "closed" }), NOW)).toBe("closed");
  });

  it("is open when the dates are missing", () => {
    expect(contestState(contest({ startsAt: null, endsAt: null }), NOW)).toBe("open");
  });

  it("treats an unparseable date as absent rather than as open-ended in the past", () => {
    expect(contestState(contest({ endsAt: "not-a-date" }), NOW)).toBe("open");
  });
});

describe("canVoteIn", () => {
  it("allows a vote only when the contest is open", () => {
    expect(canVoteIn("open")).toBe(true);
    for (const state of ["upcoming", "closed", "draft", "archived"] as const) {
      expect(canVoteIn(state)).toBe(false);
    }
  });
});

describe("contestDate", () => {
  it("renders in Medellín time, not the server timezone", () => {
    // 02:00Z on the 19th is 21:00 on the 18th in Bogotá (UTC-5).
    expect(contestDate("2026-10-19T02:00:00.000Z")).toBe("Oct 18, 2026");
  });

  it("returns null for missing or invalid input", () => {
    expect(contestDate(null)).toBeNull();
    expect(contestDate("nonsense")).toBeNull();
  });
});

describe("contestWindowLabel", () => {
  it("shows both ends when both exist", () => {
    expect(contestWindowLabel(contest())).toBe("Oct 1, 2026 – Nov 1, 2026");
  });

  it("shows one end when only one exists", () => {
    expect(contestWindowLabel(contest({ startsAt: null }))).toBe("Until Nov 1, 2026");
    expect(contestWindowLabel(contest({ endsAt: null }))).toBe("From Oct 1, 2026");
  });

  it("returns null when there are no dates", () => {
    expect(contestWindowLabel(contest({ startsAt: null, endsAt: null }))).toBeNull();
  });
});
