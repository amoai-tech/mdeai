import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("does not contact fake Supabase when deterministic café browse is unavailable", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:9");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.resetModules();
  const fetch = vi.spyOn(globalThis, "fetch");
  const { searchCafeVenueAnchorsForBrowse } = await import("../search-venue-anchors");
  const result = await searchCafeVenueAnchorsForBrowse({ limit: 5 });
  expect(result).toEqual({ rows: [], error: "Could not load cafés. Try again in a moment." });
  expect(fetch).not.toHaveBeenCalled();
});
