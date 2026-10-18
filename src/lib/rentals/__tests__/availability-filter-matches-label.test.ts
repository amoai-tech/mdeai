import { describe, expect, it } from "vitest";
import { applyAvailabilityFilters } from "@/lib/rentals/availability-filter";
import {
  isAvailabilityUnconfirmed,
  UNCONFIRMED_AVAILABILITY_STATUSES,
  UNCONFIRMED_DATE_BASES,
} from "@/lib/rentals/provenance";

/**
 * SAN-486 — the search filter and the "Availability unconfirmed" card label must agree.
 *
 * The old alignment test only checked the label function against a hand-written list, so the filter
 * could (and did) fall behind: it knew 4 markers, the label knew 7 cases, and the filter had no
 * "an owner-confirmed date wins" rule. These tests run the filter text the code actually produces
 * through a small evaluator of the PostgREST rules it uses, then compare with the label function.
 */

type Row = {
  available_from: string | null;
  available_to: string | null;
  minimum_stay_days: number | null;
  maximum_stay_days: number | null;
  metadata: Record<string, unknown>;
};

/** The filter text produced for a development-mode dated stay, Nov 1–30 2026. */
function developmentFilter(): string {
  const filters: string[] = [];
  const builder = {
    or: (f: string) => {
      filters.push(f);
      return builder;
    },
    not: () => builder,
  };
  applyAvailabilityFilters(builder, {
    checkIn: "2026-11-01",
    checkOut: "2026-11-30",
    today: "2026-10-13",
    developmentMode: true,
  });
  expect(filters).toHaveLength(1);
  return filters[0];
}

// --- a minimal evaluator for the PostgREST subset the filter uses: and(), or(), col.op.value ---------
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function column(row: Row, col: string): string | number | null {
  if (col.startsWith("metadata->>")) {
    const v = row.metadata[col.slice("metadata->>".length)];
    return v === undefined || v === null ? null : String(v); // JSON ->> gives text
  }
  return (row as unknown as Record<string, string | number | null>)[col];
}

function evaluate(expr: string, row: Row): boolean {
  const group = /^(and|or)\(([\s\S]*)\)$/.exec(expr);
  if (group) {
    const results = splitTop(group[2]).map((e) => evaluate(e, row));
    return group[1] === "and" ? results.every(Boolean) : results.some(Boolean);
  }
  const m = /^([a-z_>-]+)\.(is|eq|neq|lte|gte)\.(.+)$/.exec(expr);
  if (!m) throw new Error(`unsupported filter fragment: ${expr}`);
  const [, col, op, rhs] = m;
  const left = column(row, col);
  if (op === "is") return rhs === "null" && left === null;
  if (left === null) return false; // SQL: any comparison with NULL is not true
  if (op === "eq") return String(left) === rhs;
  if (op === "neq") return String(left) !== rhs;
  const numeric = typeof left === "number";
  const a = numeric ? left : String(left);
  const b = numeric ? Number(rhs) : rhs;
  return op === "lte" ? a <= b : a >= b;
}

const FUTURE_MOVE_IN = "2027-01-01"; // after the requested stay starts
const base = (metadata: Record<string, unknown>, over: Partial<Row> = {}): Row => ({
  available_from: FUTURE_MOVE_IN,
  available_to: null,
  minimum_stay_days: null,
  maximum_stay_days: null,
  metadata,
  ...over,
});
const admitted = (row: Row) => evaluate(developmentFilter(), row);

describe("the development search filter admits a late move-in exactly when the label says 'unconfirmed'", () => {
  const filter = developmentFilter();

  // One case per marker, taken from the same sets the filter is built from.
  it.each([...UNCONFIRMED_AVAILABILITY_STATUSES].map((v) => [`availability_status = ${v}`, { availability_status: v }] as const))(
    "%s: admitted, and labelled unconfirmed",
    (_l, metadata) => {
      expect(admitted(base(metadata))).toBe(true);
      expect(isAvailabilityUnconfirmed(metadata)).toBe(true);
    },
  );

  it.each([...UNCONFIRMED_DATE_BASES].map((v) => [`available_from_basis = ${v}`, { available_from_basis: v }] as const))(
    "%s: admitted, and labelled unconfirmed",
    (_l, metadata) => {
      expect(admitted(base(metadata))).toBe(true);
      expect(isAvailabilityUnconfirmed(metadata)).toBe(true);
    },
  );

  it.each([
    ["simulated test date (boolean)", { test_available_from_simulated: true }],
    ["simulated test date (string)", { test_available_from_simulated: "true" }],
    ["not independently confirmed and no basis", { available_from_independently_confirmed: false }],
  ])("%s: admitted, and labelled unconfirmed", (_l, metadata) => {
    expect(admitted(base(metadata))).toBe(true);
    expect(isAvailabilityUnconfirmed(metadata)).toBe(true);
  });

  // An owner-confirmed date wins over every marker, in the filter and in the label.
  it.each([
    ...[...UNCONFIRMED_AVAILABILITY_STATUSES].map((v) => [`status ${v}`, { availability_status: v }] as const),
    ...[...UNCONFIRMED_DATE_BASES].map((v) => [`basis ${v}`, { available_from_basis: v }] as const),
    ["simulated test date", { test_available_from_simulated: true }] as const,
  ])("owner-confirmed date beats marker: %s", (_l, marker) => {
    const metadata = { ...marker, available_from_independently_confirmed: true };
    expect(admitted(base(metadata))).toBe(false); // a confirmed late date does not cover the stay
    expect(isAvailabilityUnconfirmed(metadata)).toBe(false);
  });

  it("a date the source actually stated stays confirmed even when not independently confirmed", () => {
    for (const available_from_basis of ["source_explicit_date", "source_rented_until"]) {
      const metadata = { available_from_independently_confirmed: false, available_from_basis };
      expect(admitted(base(metadata))).toBe(false);
      expect(isAvailabilityUnconfirmed(metadata)).toBe(false);
    }
  });

  it("an ordinary listing with a late move-in is not admitted", () => {
    expect(admitted(base({}))).toBe(false);
    expect(admitted(base({ unrelated: "x" }))).toBe(false);
  });

  it("an unconfirmed marker is never a free pass: an expired or too-short listing is still excluded", () => {
    const metadata = { availability_status: "unconfirmed" };
    expect(admitted(base(metadata, { available_to: "2026-11-10" }))).toBe(false); // ends before Nov 30
    expect(admitted(base(metadata, { maximum_stay_days: 7 }))).toBe(false); // stay is 30 days
    expect(admitted(base(metadata, { minimum_stay_days: 90 }))).toBe(false);
  });

  it("an unknown move-in date and an on-time confirmed date stay discoverable", () => {
    expect(admitted(base({}, { available_from: null }))).toBe(true);
    expect(admitted(base({}, { available_from: "2026-10-01" }))).toBe(true);
  });

  it("agrees with the label for every combination of the markers (288 cases)", () => {
    const simulated = [undefined, true, "true", false];
    const status = [undefined, ...UNCONFIRMED_AVAILABILITY_STATUSES, "verified"];
    const basis = [undefined, ...UNCONFIRMED_DATE_BASES, "source_explicit_date", "source_rented_until"];
    const confirmed = [undefined, true, false];
    let cases = 0;
    for (const s of simulated)
      for (const st of status)
        for (const b of basis)
          for (const c of confirmed) {
            const metadata: Record<string, unknown> = {};
            if (s !== undefined) metadata.test_available_from_simulated = s;
            if (st !== undefined) metadata.availability_status = st;
            if (b !== undefined) metadata.available_from_basis = b;
            if (c !== undefined) metadata.available_from_independently_confirmed = c;
            expect(evaluate(filter, base(metadata)), JSON.stringify(metadata)).toBe(isAvailabilityUnconfirmed(metadata));
            cases++;
          }
    expect(cases).toBe(288);
  });
});
