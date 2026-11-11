import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The deterministic browser lane has no database, so café and nightlife browse must serve a
 * fixture instead of the "Could not load…" outage state. Anything else makes the discovery
 * card spec untestable in CI and hides card regressions behind a skip.
 *
 * The fixture must stay honest: labelled as a fixture, gated to non-production, and containing
 * one venue with no coordinates so the "no invented pin" rule keeps being exercised.
 */
function stubDeterministicBrowserMode() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:9");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.resetModules();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("deterministic venue browse fixture", () => {
  it("serves café cards instead of an outage, without contacting Supabase", async () => {
    stubDeterministicBrowserMode();
    const fetch = vi.spyOn(globalThis, "fetch");
    const { searchCafeVenueAnchorsForBrowse } = await import("../search-venue-anchors");

    const { rows, error } = await searchCafeVenueAnchorsForBrowse({ limit: 24 });

    expect(error).toBeNull();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((row) => row.kind === "cafe")).toBe(true);
    expect(rows.every((row) => row.name.startsWith("CI Fixture"))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves nightlife cards too, so the same journey is provable on both pages", async () => {
    stubDeterministicBrowserMode();
    const { searchNightclubVenueAnchorsForBrowse } = await import("../search-venue-anchors");

    const { rows, error } = await searchNightclubVenueAnchorsForBrowse({ limit: 24 });

    expect(error).toBeNull();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((row) => row.kind === "nightclub")).toBe(true);
  });

  it("honours the neighborhood filter used by the browse chips", async () => {
    stubDeterministicBrowserMode();
    const { searchCafeVenueAnchorsForBrowse } = await import("../search-venue-anchors");

    const { rows } = await searchCafeVenueAnchorsForBrowse({
      neighborhood: "Laureles",
      limit: 24,
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.neighborhood === "Laureles")).toBe(true);
  });

  it("keeps one coordinate-backed and one coordinate-less venue per kind", async () => {
    stubDeterministicBrowserMode();
    const { searchCafeVenueAnchorsForBrowse, venueAnchorToCoordinates } = await import(
      "../search-venue-anchors"
    );

    const { rows } = await searchCafeVenueAnchorsForBrowse({ limit: 24 });
    const mapped = rows.map((row) => venueAnchorToCoordinates(row));

    expect(mapped.some((c) => c.latitude !== null && c.longitude !== null)).toBe(true);
    expect(mapped.some((c) => c.latitude === null && c.longitude === null)).toBe(true);
  });

  it("never serves the fixture in production, even with the flag set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", "1");
    // No credentials: production keeps the honest outage path, never invented businesses.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.resetModules();
    const fetch = vi.spyOn(globalThis, "fetch");
    const { searchCafeVenueAnchorsForBrowse } = await import("../search-venue-anchors");

    const { rows, error } = await searchCafeVenueAnchorsForBrowse({ limit: 24 });

    expect(rows).toEqual([]);
    expect(error).toBe("Could not load cafés. Try again in a moment.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
