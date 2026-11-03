/**
 * SAN-486 — the availability filter, checked against the **real PostgREST parser**.
 *
 * The unit suite evaluates the emitted expression with a hand-written evaluator. That cannot
 * prove PostgREST accepts the new nested `and(or(...))` marker clause. This suite issues the
 * exact strings the code emits, read-only, and asserts the parser returns 200. A deliberately
 * invalid operator must return 400, proving the probe has teeth.
 *
 * Gated on `hasLiveSupabase()` (`LIVE_SUPABASE_TESTS=1` plus server-only `SUPABASE_URL` /
 * `SUPABASE_ANON_KEY`), matching the other live suites. It only issues `select`s.
 */
import { describe, expect, it } from "vitest";
import { applyAvailabilityFilters } from "@/lib/rentals/availability-filter";
import { hasLiveSupabase } from "@/mastra/lib/__tests__/live-supabase-gate";

type Capture = { ors: string[]; nots: string[] };

function capture(developmentMode: boolean): Capture {
  const ors: string[] = [];
  const nots: string[] = [];
  const builder = {
    or: (f: string) => {
      ors.push(f);
      return builder;
    },
    not: (column: string, op: string, value: unknown) => {
      nots.push(`${column}=${op}.${String(value)}`);
      return builder;
    },
  };
  applyAvailabilityFilters(builder, {
    checkIn: "2026-11-01",
    checkOut: "2026-11-30",
    today: "2026-10-13",
    developmentMode,
  });
  return { ors, nots };
}

async function probe(
  ors: string[],
  nots: string[] = [],
): Promise<{ status: number; code: string | null }> {
  const base = process.env.SUPABASE_URL as string;
  const key = process.env.SUPABASE_ANON_KEY as string;
  const params = new URLSearchParams({ select: "id", limit: "1", status: "eq.active" });
  for (const filter of nots) {
    const [column, value] = filter.split("=");
    params.set(column, value);
  }
  for (const filter of ors) params.append("or", `(${filter})`);

  const res = await fetch(`${base}/rest/v1/apartments?${params.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.ok) return { status: res.status, code: null };
  const body = (await res.json().catch(() => ({}))) as { code?: string };
  return { status: res.status, code: body.code ?? null };
}

describe.skipIf(!hasLiveSupabase())(
  "availability filters — accepted by the real PostgREST grammar",
  () => {
    it("accepts the development filter with the unconfirmed-marker clause", async () => {
      const { ors } = capture(true);
      expect(await probe(ors)).toEqual({ status: 200, code: null });
    });

    it("accepts the launch filter shape", async () => {
      const { ors, nots } = capture(false);
      expect(await probe(ors, nots)).toEqual({ status: 200, code: null });
    });

    it("rejects an unknown operator, proving this probe can fail", async () => {
      const result = await probe(["available_from.zzz.2026-11-01"]);
      expect(result.status).toBe(400);
      expect(result.code).toBe("PGRST100");
    });
  },
);
