import { afterEach, describe, expect, it, vi } from "vitest";
import { noopObserve, ToolStream } from "@mastra/core/tools";
import { RequestContext } from "@mastra/core/request-context";
import { restaurantSchema } from "../search-restaurants";

/**
 * Simulate "no Supabase credentials at all".
 *
 * Every name the shared resolver consults must be blank, not just the
 * server-only pair: `getSupabaseServerAnonEnv()` falls back to the public names,
 * so clearing only `SUPABASE_URL` / `SUPABASE_ANON_KEY` no longer means
 * "unavailable". (It only appeared to, because `"" ?? fallback` used to swallow
 * the fallback — the very bug that kept production on fixtures.)
 */
function withNoSupabaseCredentials() {
  for (const name of [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]) {
    vi.stubEnv(name, "");
  }
  vi.resetModules();
}

/**
 * A configured project whose catalog read fails.
 *
 * The failure is injected as an HTTP error response rather than a rejected
 * `fetch` or a dial to a closed port. Both of those are retried by supabase-js
 * with backoff (~7s), and a real `connect()` can hang indefinitely on a
 * firewalled runner — either way the test blows its timeout instead of proving
 * anything (this is what failed the PR-head `floor` job). A 4xx error settles
 * immediately and reaches the identical `if (error) -> unavailable` branch.
 */
function withFailingSupabaseFetch() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ message: "catalog unavailable" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.resetModules();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Restore in a hook, not at the end of each test: an assertion or awaited call
 * that throws would otherwise skip the manual cleanup and leak blank Supabase
 * credentials into later tests, turning one failure into order-dependent ones.
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("searchRestaurants honest data contract", () => {
  it("SAN-1468 reports an explicit unavailable envelope instead of invented restaurants", async () => {
    withNoSupabaseCredentials();
    const { searchRestaurants: search } = await import("../search-restaurants.js");

    const out = await search({ neighborhood: "Laureles", cuisine: "cafe", limit: 3 });

    // A database outage must never become believable fake businesses.
    expect(out.source).toBe("unavailable");
    expect(out.results).toEqual([]);
    expect(out.total).toBe(0);
  });

  it("SAN-1468 reports unavailable on a real connection error", async () => {
    withFailingSupabaseFetch();
    const { searchRestaurants: search } = await import("../search-restaurants.js");

    const out = await search({ neighborhood: "Laureles", limit: 3 });

    // Proves the catalog read was actually attempted (not the no-client path).
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(out.source).toBe("unavailable");
    expect(out.results).toEqual([]);
  });

  it("SAN-1468 never returns non-UUID placeholder ids to a normal user", async () => {
    withNoSupabaseCredentials();
    const { searchRestaurants: search } = await import("../search-restaurants.js");

    const out = await search({ limit: 20 });

    expect(out.results.filter((r) => r.id.startsWith("rst_"))).toEqual([]);
    expect(out.results.every((r) => UUID_RE.test(r.id))).toBe(true);
  });

  it("deterministic CI returns the existing fallback without contacting Supabase", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:9");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const { searchRestaurants: search } = await import("../search-restaurants.js");
      const out = await search({ limit: 2 });
      expect(out).toMatchObject({ source: "fallback", total: 5 });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("deterministic CI returns the same fixture for a natural-language query", async () => {
    // Regression: deterministic mode must short-circuit *every* search shape, not
    // only the filter-only path, or a natural-language query silently attempts a
    // live catalog read that CI has blocked.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.invalid");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const { searchRestaurants: search } = await import("../search-restaurants.js");
      const out = await search({ queryText: "rooftop dinner in Provenza", limit: 3 });

      expect(out.source).toBe("fallback");
      expect(out.total).toBe(5);
      expect(out.results.length).toBe(3);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("MA-P0-07 envelope includes results, total, and source", async () => {
    withNoSupabaseCredentials();
    const { searchRestaurants: search } = await import("../search-restaurants.js");

    const out = await search({ limit: 2 });

    expect(out).toMatchObject({
      results: expect.any(Array),
      total: expect.any(Number),
      source: "unavailable",
    });
  });
});

describe("searchRestaurantsTool execute", () => {
  it("UX-T-014 returns structured envelope for CopilotKit disabled render (no writer.custom)", async () => {
    withNoSupabaseCredentials();
    const { searchRestaurantsTool: isolatedTool } = await import("../search-restaurants.js");
    const writer = new ToolStream({
      prefix: "test",
      callId: "call-1",
      name: "searchRestaurantsTool",
      runId: "run-1",
    });
    const custom = vi.spyOn(writer, "custom");
    const execute = isolatedTool.execute;
    if (!execute) throw new Error("searchRestaurantsTool has no execute");
    const out = (await execute(
      { neighborhood: "Laureles", limit: 2 },
      { writer, requestContext: new RequestContext(), observe: noopObserve },
    )) as { results: unknown[]; total: number; source: string };

    expect(Array.isArray(out.results)).toBe(true);
    expect(out).toMatchObject({
      results: expect.any(Array),
      total: expect.any(Number),
      source: expect.any(String),
    });
    expect(custom).not.toHaveBeenCalled();
  });

  it("MA-P0-06 execute returns a safe envelope without throwing when Supabase is unavailable", async () => {
    withNoSupabaseCredentials();
    const { searchRestaurantsTool: tool } = await import("../search-restaurants.js");
    const execute = tool.execute;
    if (!execute) throw new Error("searchRestaurantsTool has no execute");

    await expect(
      execute(
        { neighborhood: "Laureles", limit: 3 },
        { requestContext: new RequestContext(), observe: noopObserve },
      ),
    ).resolves.toMatchObject({
      results: [],
      total: 0,
      source: "unavailable",
    });
  });
});

describe("restaurantSchema is satisfiable by every honest result", () => {
  it("accepts a row with unknown price tier and unknown rating", async () => {
    const { rowToRestaurant } = await import("../search-restaurants.js");

    const restaurant = rowToRestaurant({
      id: "3f0a3f36-4a1e-4a3e-8f3e-000000000001",
      name: "Test Kitchen",
      cuisine_types: ["Colombian"],
      price_level: null as unknown as number,
      address: null,
      city: "Medellín",
      neighborhood: "Laureles",
      latitude: 6.25,
      longitude: -75.59,
      primary_image_url: null,
      rating: null,
      tags: null,
      google_place_id: null,
      maps_url: null,
      ai_summary: null,
    });

    expect(restaurant.priceTier).toBeUndefined();
    expect(restaurant.rating).toBeUndefined();
    expect(restaurant.avgPricePerPerson).toBeUndefined();
    expect(restaurantSchema.safeParse(restaurant).success).toBe(true);
  });
});
