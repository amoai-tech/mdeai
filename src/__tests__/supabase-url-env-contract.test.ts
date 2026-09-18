/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

/**
 * MDE-ENV-002 (SAN-1333) — regression guard.
 *
 * Production injects `NEXT_PUBLIC_SUPABASE_URL`, never a bare `SUPABASE_URL`.
 * Twelve modules used to read the bare name, so every concierge vertical got a
 * `null` Supabase client and silently served fixture data instead of real
 * listings — the concierge rendered "No rentals matched" for queries that had
 * matches:
 *
 *   [search-rentals] Supabase query failed, falling back to mock: Supabase client unavailable
 *
 * All server-side credential resolution must now go through
 * `src/lib/supabase/server-env.ts`, which accepts either name. This test fails
 * if a bare read is reintroduced anywhere in `src/`.
 *
 * Sources are collected with Vite's import glob rather than `node:fs`, so the
 * scan needs no filesystem access and no dynamic path construction.
 */

const RESOLVER = "lib/supabase/server-env.ts";

/**
 * A bare read of either credential name, in dot or bracket form. Both are
 * guarded: the URL *and* the anon key have `NEXT_PUBLIC_` fallbacks, so a direct
 * read of either silently degrades the same way.
 */
const BARE_READ =
  /process\.env(?:\.(?:SUPABASE_URL|SUPABASE_ANON_KEY)\b|\[["'](?:SUPABASE_URL|SUPABASE_ANON_KEY)["']\])/;

const RAW_SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Modules that must resolve credentials through the shared helper. */
const CONSUMERS = [
  "mastra/tools/search-rentals.ts",
  "mastra/tools/search-events.ts",
  "mastra/tools/search-restaurants.ts",
  "mastra/tools/search-attractions.ts",
  "mastra/tools/search-venue-anchors.ts",
  "mastra/lib/intelligence-rental-search.ts",
  "mastra/lib/intelligence-event-search.ts",
  "mastra/lib/intelligence-restaurant-search.ts",
  "mastra/lib/search-grounding-quota.ts",
  "mastra/lib/grounding-quota.ts",
  "lib/restaurant-place-photo.ts",
  "lib/rentals/get-rental-detail.ts",
  "lib/supabase/service-env.ts",
  "lib/supabase/user-scoped.ts",
];

function isTestFile(rel: string): boolean {
  return rel.includes("__tests__/") || /\.(test|spec)\.tsx?$/.test(rel);
}

/** `{ rel, body }` for every non-test source module under `src/`. */
function sourceFiles(): { rel: string; body: string }[] {
  return Object.entries(RAW_SOURCES)
    .map(([abs, body]) => ({ rel: abs.replace(/^\/src\//, ""), body }))
    .filter(({ rel }) => !isTestFile(rel) && !rel.endsWith(".d.ts"));
}

function readSource(rel: string): string {
  const file = sourceFiles().find((f) => f.rel === rel);
  if (!file) throw new Error(`source not found in glob: ${rel}`);
  return file.body;
}

describe("server-side Supabase URL contract", () => {
  it("scans a non-trivial number of source files", () => {
    expect(sourceFiles().length).toBeGreaterThan(100);
  });

  it("only server-env.ts reads the bare SUPABASE_URL name", () => {
    const offenders = sourceFiles()
      .filter(({ body }) => BARE_READ.test(body))
      .map(({ rel }) => rel)
      .sort();
    expect(offenders).toEqual([RESOLVER]);
  });

  it("server-env.ts resolves both names through the blank-skipping helper", () => {
    const body = readSource(RESOLVER);
    expect(body).toContain("process.env.SUPABASE_URL");
    expect(body).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(body).toContain("firstPresent(");
    // `??` alone lets an empty Sensitive value stop the chain, which is exactly
    // how production kept serving fixtures after the first fix.
    expect(body).not.toMatch(/process\.env\.SUPABASE_URL\s*\?\?/);
  });

  it("env.ts resolves public credentials through the blank-skipping helper", () => {
    // getSupabaseEnv() feeds the browser client, middleware and SSR, and throws
    // on a missing value — so a blank publishable key must fall through to the
    // legacy anon key instead of being returned and throwing.
    const body = readSource("lib/supabase/env.ts");
    expect(body).toContain("firstPresent(");
    expect(body).not.toMatch(
      /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*\?\?/,
    );
  });

  it.each(CONSUMERS)("%s resolves credentials through the shared helper", (rel) => {
    const body = readSource(rel);
    const usesHelper =
      body.includes("getSupabaseServerAnonEnv") ||
      body.includes("getSupabaseServiceEnv");
    expect(usesHelper).toBe(true);
    expect(BARE_READ.test(body)).toBe(false);
  });
});
