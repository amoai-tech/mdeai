/**
 * The price predicate, checked against the **real PostgREST parser**.
 *
 * `search-rentals-monthly-only.test.ts` evaluates the emitted `or=(...)` with a hand-written
 * stub. A stub cannot prove the clause is valid PostgREST — and that is not hypothetical: the
 * first version of this fix emitted `or(...)` without the surrounding parentheses and every
 * request came back `42703 column apartments.orprice_daily does not exist`. The unit tests
 * passed anyway, because the stub accepted whatever it was given.
 *
 * So this suite asserts only what a stub cannot: that the real parser accepts the exact strings
 * the code emits, for both the unbudgeted and budgeted forms, and that a malformed variant is
 * rejected — proving the assertion has teeth.
 *
 * Read-only: it issues `select`s and asserts on the HTTP status and error code. It never writes.
 *
 * Gated on `hasLiveSupabase()` (`LIVE_SUPABASE_TESTS=1` plus server-only `SUPABASE_URL` /
 * `SUPABASE_ANON_KEY`), matching `SAN-1314`'s contract, so `npm test` and Floor stay
 * deterministic and never reach production.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rentalPricePredicate } from "../search-rentals";
import { hasLiveSupabase } from "../../lib/__tests__/live-supabase-gate";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

loadEnvLocal();

type Probe = { status: number; code: string | null; message: string | null };

/** Issue the predicate the way `search-rentals.ts` does: `or=(<clause>)`. */
async function probe(clause: string): Promise<Probe> {
  return probeRaw(`(${clause})`);
}

/** Issue `or=<raw>`, so a caller can reproduce a malformed form. */
async function probeRaw(raw: string): Promise<Probe> {
  const url = process.env.SUPABASE_URL as string;
  const key = process.env.SUPABASE_ANON_KEY as string;
  const params = new URLSearchParams();
  params.set("select", "id,price_daily,price_monthly,currency");
  params.set("status", "eq.active");
  params.append("or", raw);
  params.append("or", "(available_to.is.null,available_to.gte.2026-01-01)");
  params.set("limit", "1");
  const res = await fetch(`${url}/rest/v1/apartments?${params.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.ok) return { status: res.status, code: null, message: null };
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  return { status: res.status, code: body.code ?? null, message: body.message ?? null };
}

describe.skipIf(!hasLiveSupabase())(
  "rental price predicate — accepted by the real PostgREST grammar",
  () => {
    it("accepts the unbudgeted predicate", async () => {
      const result = await probe(rentalPricePredicate(null));
      expect(result.status).toBe(200);
    });

    it("accepts the budgeted predicate with its currency-guarded alternatives", async () => {
      const result = await probe(rentalPricePredicate(80));
      expect(result.status).toBe(200);
    });

    it("rejects the unwrapped form, proving this probe can actually fail", async () => {
      // The exact shape of the bug this suite exists to catch: the predicate sent without its
      // wrapping parentheses. PostgREST reads `price_daily.not.is.null` as a column reference
      // and answers 42703. The unit-test stub accepted it happily, so only this proves it.
      const result = await probeRaw(rentalPricePredicate(null));
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.code).toBe("42703");
    });
  },
);
