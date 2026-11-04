import { afterEach, describe, expect, it, vi } from "vitest";
import { hasE2eEnv } from "./auth";

afterEach(() => vi.unstubAllEnvs());

function setQaCredentials(url: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_integration");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-service-key");
}

describe("authenticated E2E backend eligibility", () => {
  it("rejects the CI fixture even with a local service key", () => {
    setQaCredentials("http://127.0.0.1:9");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(hasE2eEnv()).toBe(false);
  });

  it("rejects the known fake localhost port even with plausible credentials", () => {
    setQaCredentials("http://localhost:9");
    expect(hasE2eEnv()).toBe(false);
  });

  it("rejects malformed URLs, unsupported schemes and insecure remote HTTP", () => {
    for (const url of ["not-a-url", "file:///tmp/secret", "http://example.supabase.co"]) {
      setQaCredentials(url);
      expect(hasE2eEnv(), url).toBe(false);
    }
  });

  it("accepts local CLI Supabase over HTTP and HTTPS candidates without contacting them", () => {
    for (const url of ["http://127.0.0.1:54321", "https://example.supabase.co"]) {
      setQaCredentials(url);
      expect(hasE2eEnv(), url).toBe(true);
    }
  });

  it("rejects missing service credentials", () => {
    setQaCredentials("https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(hasE2eEnv()).toBe(false);
  });
});
