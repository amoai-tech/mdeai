import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * Regression guard: reusing webpack's persistent cache in production served stale Tailwind CSS (a new
 * utility in an already-built file was missing from the shipped stylesheet). Production builds must
 * keep it off; development keeps it for speed.
 */
describe("next.config webpack cache", () => {
  const run = (dev: boolean) => {
    const config = { cache: { type: "filesystem" } };
    // The Next.js build context has more fields; only `dev` matters here.
    nextConfig.webpack?.(config as never, { dev } as never);
    return config.cache as unknown;
  };

  it("disables the persistent cache for production builds", () => {
    expect(run(false)).toBe(false);
  });

  it("leaves the cache alone in development", () => {
    expect(run(true)).toEqual({ type: "filesystem" });
  });
});
