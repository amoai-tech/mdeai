import { afterEach, describe, expect, it, vi } from "vitest";
import { hasE2eEnv } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("authenticated E2E backend eligibility", () => {
  it("rejects the CI fixture even with a local service key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:9");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-key");
    expect(hasE2eEnv()).toBe(false);
  });

  it("accepts a configured backend without contacting it", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_integration");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-key");
    expect(hasE2eEnv()).toBe(true);
  });
});
