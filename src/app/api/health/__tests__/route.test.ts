import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const GOOD = {
  GOOGLE_PLACES_API_KEY: "AIza-test-placeholder-value",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "AIza-browser-placeholder",
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "mde-map-id",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  ADK_GROUNDING_URL: "https://sidecar.example",
};

function stubGood(overrides: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...GOOD, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("returns ok with booleans only when the required configuration exists", async () => {
    stubGood();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks).toEqual({
      placesKey: true,
      mapId: true,
      mapsKey: true,
      supabase: true,
      sidecar: true,
    });
    const raw = JSON.stringify(body);
    for (const value of Object.values(GOOD)) {
      expect(raw).not.toContain(value);
    }
    expect(body).not.toHaveProperty("environment");
  });

  it("fails closed when the server Places key is missing or padding-only", async () => {
    stubGood({
      GOOGLE_PLACES_API_KEY: "",
      GOOGLE_MAPS_SERVER_API_KEY: "",
      GOOGLE_MAPS_API_KEY: "",
    });
    expect((await GET()).status).toBe(503);

    stubGood({ GOOGLE_PLACES_API_KEY: "        " });
    expect((await GET()).status).toBe(503);
  });

  it("fails closed for DEMO_MAP_ID and a missing browser Maps key", async () => {
    stubGood({ NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "DEMO_MAP_ID" });
    expect((await GET()).status).toBe(503);

    stubGood({ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "   " });
    expect((await GET()).status).toBe(503);
  });

  it("fails closed on whitespace-only or missing Supabase configuration", async () => {
    stubGood({ NEXT_PUBLIC_SUPABASE_URL: "   " });
    expect((await GET()).status).toBe(503);

    stubGood({ NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" });
    expect((await GET()).status).toBe(503);
  });

  it("accepts a valid publishable key when the anon key is empty", async () => {
    stubGood({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).checks.supabase).toBe(true);
  });

  it("does not fail the release when only the sidecar is absent", async () => {
    stubGood({ ADK_GROUNDING_URL: "" });
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).checks.sidecar).toBe(false);
  });
});
