import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const GOOD = {
  GOOGLE_PLACES_API_KEY: "AIza-test-placeholder-value",
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "mde-map-id",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  ADK_GROUNDING_URL: "https://sidecar.example",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("returns ok with booleans only when the required configuration exists", async () => {
    for (const [key, value] of Object.entries(GOOD)) vi.stubEnv(key, value);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checks).toEqual({
      placesKey: true,
      mapId: true,
      supabase: true,
      sidecar: true,
    });
    const raw = JSON.stringify(body);
    for (const value of Object.values(GOOD)) {
      expect(raw).not.toContain(value);
    }
  });

  it("fails closed when the server Places key is missing", async () => {
    for (const [key, value] of Object.entries(GOOD)) vi.stubEnv(key, value);
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.placesKey).toBe(false);
  });

  it("fails closed when the Map ID is missing", async () => {
    for (const [key, value] of Object.entries(GOOD)) vi.stubEnv(key, value);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).checks.mapId).toBe(false);
  });

  it("does not fail the release when only the sidecar is absent", async () => {
    for (const [key, value] of Object.entries(GOOD)) vi.stubEnv(key, value);
    vi.stubEnv("ADK_GROUNDING_URL", "");
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).checks.sidecar).toBe(false);
  });
});
