import { afterEach, describe, expect, it, vi } from "vitest";
import {
  restaurantSchema,
  searchRestaurantsTool,
} from "../search-restaurants";

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
 * Restore in a hook, not at the end of each test: an assertion or awaited call
 * that throws would otherwise skip the manual cleanup and leak blank Supabase
 * credentials into later tests, turning one failure into order-dependent ones.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("searchRestaurants fallback + envelope", () => {
  it("MA-P0-05 returns curated fallback when Supabase client unavailable", async () => {
    withNoSupabaseCredentials();
    const { searchRestaurants: search } = await import("../search-restaurants.js");

    const out = await search({ neighborhood: "Laureles", cuisine: "cafe", limit: 3 });

    expect(out.source).toBe("fallback");
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results.every((r) => restaurantSchema.safeParse(r).success)).toBe(true);
  });

  it("MA-P0-07 envelope includes results, total, and source", async () => {
    withNoSupabaseCredentials();
    const { searchRestaurants: search } = await import("../search-restaurants.js");

    const out = await search({ limit: 2 });

    expect(out).toMatchObject({
      results: expect.any(Array),
      total: expect.any(Number),
      source: "fallback",
    });
  });
});

describe("searchRestaurantsTool execute", () => {
  it("UX-T-014 returns structured envelope for CopilotKit disabled render (no writer.custom)", async () => {
    const custom = vi.fn().mockResolvedValue(undefined);
    const out = (await searchRestaurantsTool.execute!(
      { neighborhood: "Laureles", limit: 2 },
      { writer: { custom } },
    )) as { results: unknown[]; total: number; source: string };

    expect(out.results.length).toBeGreaterThan(0);
    expect(out).toMatchObject({
      results: expect.any(Array),
      total: expect.any(Number),
      source: expect.any(String),
    });
    expect(custom).not.toHaveBeenCalled();
  });

  it("MA-P0-06 execute returns safe envelope without throwing when Supabase unavailable", async () => {
    withNoSupabaseCredentials();
    const { searchRestaurantsTool: tool } = await import("../search-restaurants.js");

    await expect(
      tool.execute!({ neighborhood: "Laureles", limit: 3 }, {}),
    ).resolves.toMatchObject({
      results: expect.any(Array),
      total: expect.any(Number),
      source: "fallback",
    });
  });
});
