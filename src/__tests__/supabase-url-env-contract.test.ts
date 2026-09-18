import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * MDE-ENV-002 (SAN-1333) — regression guard.
 *
 * Production injects `NEXT_PUBLIC_SUPABASE_URL`, never a bare `SUPABASE_URL`.
 * Eleven modules used to read the bare name, so every concierge vertical got a
 * `null` Supabase client and silently served `MOCK_RENTALS`-style fixture data
 * behind HTTP 200:
 *
 *   [search-rentals] Supabase query failed, falling back to mock: Supabase client unavailable
 *
 * All server-side credential resolution must now go through
 * `src/lib/supabase/server-env.ts`, which accepts either name. This test fails
 * if a bare read is reintroduced anywhere in `src/`.
 */

const SRC = path.resolve(process.cwd(), "src");
const RESOLVER = path.join("lib", "supabase", "server-env.ts");

/** `process.env.SUPABASE_URL` and `process.env["SUPABASE_URL"]`. */
const BARE_READ = /process\.env(?:\.SUPABASE_URL\b|\[["']SUPABASE_URL["']\])/;

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
  return (
    rel.includes(`${path.sep}__tests__${path.sep}`) ||
    /\.(test|spec)\.tsx?$/.test(rel)
  );
}

function sourceFiles(): string[] {
  return fs
    .readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !entry.endsWith(".d.ts"))
    .filter((entry) => !isTestFile(entry))
    .map((entry) => entry.split(path.sep).join(path.sep));
}

describe("server-side Supabase URL contract", () => {
  it("scans a non-trivial number of source files", () => {
    expect(sourceFiles().length).toBeGreaterThan(100);
  });

  it("only server-env.ts reads the bare SUPABASE_URL name", () => {
    const offenders = sourceFiles().filter((rel) =>
      BARE_READ.test(fs.readFileSync(path.join(SRC, rel), "utf8")),
    );
    expect(offenders).toEqual([RESOLVER]);
  });

  it("server-env.ts keeps the NEXT_PUBLIC_SUPABASE_URL fallback", () => {
    const body = fs.readFileSync(path.join(SRC, RESOLVER), "utf8");
    expect(body).toContain(
      "process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it.each(CONSUMERS)("%s resolves credentials through the shared helper", (rel) => {
    const body = fs.readFileSync(path.join(SRC, rel), "utf8");
    const usesHelper =
      body.includes("getSupabaseServerAnonEnv") ||
      body.includes("getSupabaseServiceEnv");
    expect(usesHelper).toBe(true);
    expect(BARE_READ.test(body)).toBe(false);
  });
});
