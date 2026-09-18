import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { searchRestaurantsIntelligent } from "../intelligence-restaurant-search";
import { hasLiveSupabase } from "./live-supabase-gate";

/** Load mdeapp/.env.local when vitest runs without --env-file (CI skip path). */
function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
}

loadEnvLocal();

function isUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function namesInclude(results: { name: string }[], ...needles: string[]) {
  const names = results.map((r) => r.name.toLowerCase());
  return needles.some((n) => names.some((name) => name.includes(n.toLowerCase())));
}

describe.skipIf(!hasLiveSupabase())("SEARCH-003 — Hybrid Restaurant Search + Venue Signals (live)", () => {
  it("GQ-S01: quiet rooftop Provenza ranks Relato or Sambombi with human_qa signals", async () => {
    const r = await searchRestaurantsIntelligent({
      queryText: "quiet rooftop dinner Provenza",
      limit: 5,
    });

    expect(r.results.length).toBeGreaterThanOrEqual(2);
    expect(r.source).toBe("supabase");
    expect(namesInclude(r.results, "Relato", "Sambombi")).toBe(true);
    for (const row of r.results.slice(0, 3)) {
      expect(isUuid(row.id)).toBe(true);
    }
    const withSignal = r.results.find((x) => x.signalSource === "human_qa");
    expect(withSignal).toBeDefined();
    expect(r.slots.neighborhood).toBe("Provenza");
    expect(r.slots.wantsRooftop).toBe(true);
    expect(r.slots.wantsQuiet).toBe(true);
  }, 60_000);

  it("cocktail restaurant Poblado returns signal-backed fine-dining peers", async () => {
    const r = await searchRestaurantsIntelligent({
      queryText: "cocktail restaurant Poblado",
      limit: 5,
    });

    expect(r.results.length).toBeGreaterThanOrEqual(1);
    expect(namesInclude(r.results, "Alambique", "O.C.I.", "Carmen", "Dos Santos")).toBe(true);
    expect(r.slots.wantsCocktails).toBe(true);
    const boosted = r.results.filter((x) => x.rankScore != null && x.rankScore > 0);
    expect(boosted.length).toBeGreaterThan(0);
  }, 60_000);

  it("romantic dinner uses date_night slot boost (signal path, city-wide)", async () => {
    const r = await searchRestaurantsIntelligent({
      queryText: "romantic dinner Medellín",
      limit: 5,
    });

    expect(r.results.length).toBeGreaterThanOrEqual(1);
    expect(r.slots.wantsDateNight).toBe(true);
    expect(r.slots.wantsCocktails).toBeUndefined();
    expect(r.results.every((x) => isUuid(x.id))).toBe(true);
    expect(r.results.some((x) => x.signalSource === "human_qa")).toBe(true);
    expect(namesInclude(r.results, "Carmen", "El Cielo", "O.C.I.")).toBe(true);
  }, 60_000);

  it("anti-touristy local query prefers Mondongos over high-touristy peers", async () => {
    const r = await searchRestaurantsIntelligent({
      queryText: "local authentic not touristy Laureles",
      limit: 5,
    });

    expect(r.slots.wantsAntiTouristy).toBe(true);
    expect(r.slots.wantsHiddenGem).toBe(true);
    expect(namesInclude(r.results, "Mondongos")).toBe(true);
  }, 60_000);

  it("rankScore orders results descending when signals present", async () => {
    const r = await searchRestaurantsIntelligent({
      queryText: "quiet rooftop Provenza",
      limit: 5,
    });

    const scores = r.results.map((x) => x.rankScore ?? 0);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  }, 60_000);
});

/**
 * SAN-1314 regression guard for the live-suite gate.
 *
 * These assertions are deterministic and env-independent. They exist because the
 * original gate activated the live suites whenever *any* `NEXT_PUBLIC_*` Supabase
 * key was present in the workflow env, while the code under test reads the
 * server-only `SUPABASE_URL` / `SUPABASE_ANON_KEY` contract. That mismatch made
 * Floor run live production queries with a `null` client and fail with
 * "expected 0 to be greater than or equal to N" instead of a config error.
 */
describe("live Supabase integration env gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables live certification only with the explicit opt-in and server-only credentials", () => {
    vi.stubEnv("LIVE_SUPABASE_TESTS", "1");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "server-anon");
    expect(hasLiveSupabase()).toBe(true);
  });

  it("ignores NEXT_PUBLIC_* keys, which the code under test never reads", () => {
    vi.stubEnv("LIVE_SUPABASE_TESTS", "1");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(hasLiveSupabase()).toBe(false);
  });

  it("stays disabled without the explicit opt-in, even with full credentials", () => {
    vi.stubEnv("LIVE_SUPABASE_TESTS", "");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "server-anon");
    expect(hasLiveSupabase()).toBe(false);
  });
});
