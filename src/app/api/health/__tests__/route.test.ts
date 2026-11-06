import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("returns boolean-only readiness without leaking credential values", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key-for-tests");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "server-key-for-tests");

    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const responseText = await response.clone().text();
    expect(await response.json()).toEqual({
      ok: true,
      checks: {
        deploymentConfigured: true,
        supabaseConfigured: true,
        placesConfigured: true,
      },
    });
    expect(responseText).not.toContain("server-key-for-tests");
  });

  it("reports missing Places configuration without pretending the provider works", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key-for-tests");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "fallback-must-not-mask-empty-primary");

    const response = GET();
    expect(response.status).toBe(503);
    expect((await response.json()).checks.placesConfigured).toBe(false);
  });

  it("accepts the server key fallback when the primary key is absent", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key-for-tests");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", undefined);
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "server-key-for-tests");

    const response = GET();
    expect(response.status).toBe(200);
  });
});
