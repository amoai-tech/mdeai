import { expect, test } from "@playwright/test";
import { hasE2eEnv, signInAsOnOrigin } from "./helpers/auth";

/**
 * One release-scoped, real HTTP proof of the SAN-106 regression.
 * No token, cookie or provider payload is written to artifacts.
 * The rental ID was verified against real data on 2026-11-06; override when
 * the development inventory changes.
 */
const base = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const observedRentalId = "750e8400-e29b-41d4-a716-446655440002";
const rentalId = process.env.PROD_SMOKE_NEARBY_RENTAL_ID?.trim() || observedRentalId;
const expectedSha = process.env.PROD_SMOKE_EXPECTED_SHA?.trim() ?? "";
const url = (path: string) => new URL(path, base.endsWith("/") ? base : base + "/").toString();

test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe("post-deploy real Nearby smoke (SAN-106)", () => {
  test.skip(!base, "Only run with explicit PROD_SMOKE_BASE_URL");

  test("release identity, Rentals and boolean config readiness", async ({ request }) => {
    const version = await request.get(url("/api/version"));
    expect(version.status(), "/api/version must answer with a deployed SHA").toBe(200);
    const body = await version.json() as { sha?: string; environment?: string };
    expect(body.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(body.environment).toBe("production");
    if (expectedSha) expect(body.sha, "served SHA differs from promoted commit").toBe(expectedSha);

    const rentals = await request.get(url("/rentals"));
    expect(rentals.status(), "/rentals page failed").toBe(200);

    const health = await request.get(url("/api/health"));
    expect(health.status(), "server configuration is incomplete").toBe(200);
    const readiness = await health.json() as {
      ok?: boolean;
      checks?: Record<string, unknown>;
    };
    expect(readiness.ok).toBe(true);
    for (const value of Object.values(readiness.checks ?? {})) {
      expect(typeof value, "config checks must contain booleans only").toBe("boolean");
      expect(value).toBe(true);
    }
    expect(Object.keys(readiness.checks ?? {}).length).toBeGreaterThan(0);
  });

  test("guest Nearby is 401, while standalone café search remains public", async ({ request }) => {
    const nearby = await request.post(url("/api/grounded/search"), {
      data: { query: "cafés", intent: "cafe", nearbyRentalId: rentalId, nearbyRadiusMeters: 800 },
    });
    expect(nearby.status(), "guest must never reach rental-anchored Places").toBe(401);
    const denied = await nearby.json() as { error?: string };
    expect(denied.error).toBe("authentication_required");

    const standalone = await request.post(url("/api/grounded/search"), {
      data: { query: "coffee shops in Laureles", intent: "cafe", limit: 5 },
    });
    expect(standalone.status(), "public standalone café search should not be sign-in gated").toBe(200);
    const body = await standalone.json() as { results?: unknown[] };
    expect(Array.isArray(body.results), "standalone response must be a real provider envelope").toBe(true);
  });

  test("signed-in rental Nearby returns real Google Places and preserves anchor", async ({ page }) => {
    expect(hasE2eEnv(), "missing Supabase QA credentials; signed-in smoke cannot be skipped").toBe(true);
    await signInAsOnOrigin(page, base);
    const response = await page.request.post(url("/api/grounded/search"), {
      data: { query: "cafés", intent: "cafe", nearbyRentalId: rentalId, nearbyRadiusMeters: 800 },
    });
    expect(response.status(), "authenticated Nearby must not return 401/500/503").toBe(200);

    const body = await response.json() as {
      metadata?: { searchMode?: string; anchorPinId?: string; provider?: string; radiusMeters?: number };
      results?: Array<{ id?: string; latitude?: number; longitude?: number }>;
      attribution?: unknown[];
    };
    expect(body.metadata?.searchMode).toBe("nearby");
    expect(body.metadata?.anchorPinId).toBe("rental-" + rentalId);
    expect(body.metadata?.provider).toBe("google_places_nearby");
    expect(body.metadata?.radiusMeters).toBe(800);
    expect(body.results?.length ?? 0, "no real Google Places results returned").toBeGreaterThan(0);
    expect(body.attribution?.length ?? 0, "missing provider attribution").toBeGreaterThan(0);
    for (const place of body.results ?? []) {
      expect(place.id?.length ?? 0).toBeGreaterThan(0);
      expect(Number.isFinite(place.latitude)).toBe(true);
      expect(Number.isFinite(place.longitude)).toBe(true);
    }
  });
});
