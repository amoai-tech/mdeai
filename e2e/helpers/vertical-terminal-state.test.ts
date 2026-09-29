/**
 * SAN-1366 — the four required scenario rows, proven at the decision layer.
 *
 * This is deliberately a unit test of `classifyVerticalTerminalState`, not a production run. Two of
 * the four rows cannot be staged in production at all (breaking the search API, or breaking card
 * rendering) and staging them would mean breaking the live site. The decision function is what
 * converts a DOM observation into green/red, so proving it here proves the matrix exactly, and the
 * Playwright spec separately proves the DOM wiring reaches it.
 *
 * The last block is the guard against this fix degenerating into "make the smoke always pass": a
 * vertical may only report `empty` when an explicit empty-state element is actually present.
 */
import { describe, expect, it } from "vitest";
import {
  VERTICALS,
  classifyVerticalTerminalState,
  type VerticalName,
  type VerticalSnapshot,
} from "./vertical-terminal-state";

const NAMES = Object.keys(VERTICALS) as VerticalName[];

const scenario = (snapshot: VerticalSnapshot, vertical: VerticalName = "rentals") =>
  classifyVerticalTerminalState(vertical, snapshot);

describe("SAN-1366 required scenario matrix", () => {
  it("row 1 · app healthy + inventory → green, state 'results'", () => {
    const verdict = scenario({ results: 4, empty: 0, error: 0 });
    expect(verdict).toEqual({ ok: true, state: "results" });
  });

  it("row 2 · app healthy + zero inventory → green, state 'empty' (not an application failure)", () => {
    const verdict = scenario({ results: 0, empty: 1, error: 0 });
    expect(verdict).toEqual({ ok: true, state: "empty" });
  });

  it("row 3 · search/API fails → red", () => {
    const verdict = scenario({ results: 0, empty: 0, error: 1 });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/application failure/i);
  });

  it("row 4 · results returned but cards never render → red", () => {
    // The API answered, nothing painted: no cards, and crucially no empty state either.
    const verdict = scenario({ results: 0, empty: 0, error: 0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/no terminal state settled/i);
  });
});

describe("SAN-1366 anti-always-pass invariants", () => {
  it("never reports 'empty' from absence alone, for any vertical", () => {
    for (const vertical of NAMES) {
      const verdict = scenario({ results: 0, empty: 0, error: 0 }, vertical);
      expect(verdict.ok, `${vertical} passed with nothing rendered`).toBe(false);
    }
  });

  it("rejects an error surface when nothing rendered — a failure is not an empty marketplace", () => {
    for (const vertical of NAMES) {
      expect(scenario({ results: 0, empty: 0, error: 2 }, vertical).ok).toBe(false);
    }
  });

  it("rejects an ambiguous state where results and an empty state are both visible", () => {
    expect(scenario({ results: 3, empty: 1, error: 0 }).ok).toBe(false);
  });

  it("does not let an error surface negate an actually rendered result set", () => {
    // An ancillary banner must not fail a run whose cards provably rendered. Guarded explicitly
    // so a future change to the error rule cannot silently turn this into a false red.
    expect(scenario({ results: 3, empty: 0, error: 1 })).toEqual({
      ok: true,
      state: "results",
    });
  });

  it("covers exactly the four smoke verticals, each with a query and its own empty state", () => {
    expect(NAMES.sort()).toEqual(["cafes", "events", "rentals", "restaurants"]);
    for (const vertical of NAMES) {
      const spec = VERTICALS[vertical];
      expect(spec.query.length, `${vertical} query`).toBeGreaterThan(0);
      expect(spec.empty.length, `${vertical} must declare an explicit empty state`).toBeGreaterThan(0);
      // The empty state must be a different element from the result card, or "empty" could be
      // satisfied by the very cards it is supposed to contradict.
      for (const empty of spec.empty) {
        expect(empty, `${vertical} empty selector duplicates its card selector`).not.toBe(
          spec.cards,
        );
      }
    }
  });

  it("treats whole-number counts consistently at the boundary", () => {
    expect(scenario({ results: 1, empty: 0, error: 0 })).toEqual({ ok: true, state: "results" });
    expect(scenario({ results: 0, empty: 1, error: 0 })).toEqual({ ok: true, state: "empty" });
  });
});
