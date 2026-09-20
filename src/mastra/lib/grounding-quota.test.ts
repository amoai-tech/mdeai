import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { incrementAndCheckGroundingQuota } from "./grounding-quota";

describe("incrementAndCheckGroundingQuota", () => {
  beforeEach(() => {
    vi.stubEnv("MAPS_GROUNDING_DAILY_LIMIT", "");
    for (const name of [
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
    ]) {
      vi.stubEnv(name, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks when MAPS_GROUNDING_DAILY_LIMIT=0", async () => {
    vi.stubEnv("MAPS_GROUNDING_DAILY_LIMIT", "0");
    const r = await incrementAndCheckGroundingQuota();
    expect(r).toEqual({ allowed: false, reason: "disabled" });
  });

  it("allows when Supabase not configured (dev)", async () => {
    const r = await incrementAndCheckGroundingQuota();
    expect(r).toEqual({ allowed: true });
  });
});
