import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reserve, getEnv } = vi.hoisted(() => ({
  reserve: vi.fn(),
  getEnv: vi.fn(),
}));

vi.mock("@/lib/supabase/service-env", () => ({ getSupabaseServiceEnv: getEnv }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: reserve }),
}));

import { incrementAndCheckSearchGroundingQuota } from "./search-grounding-quota";

describe("incrementAndCheckSearchGroundingQuota", () => {
  beforeEach(() => {
    vi.stubEnv("ENABLE_SEARCH_GROUNDING", "1");
    vi.stubEnv("SEARCH_GROUNDING_DAILY_CAP", "2");
    vi.stubEnv("VERCEL_ENV", "production");
    getEnv.mockReturnValue({ url: "https://example.supabase.co", serviceRoleKey: "mock" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("disables search when the flag is off", async () => {
    vi.stubEnv("ENABLE_SEARCH_GROUNDING", "0");
    expect(await incrementAndCheckSearchGroundingQuota()).toEqual({ allowed: false, reason: "disabled" });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("allows opted-in Vercel production only after atomic reservation", async () => {
    reserve.mockResolvedValue({ data: true, error: null });
    expect(await incrementAndCheckSearchGroundingQuota()).toEqual({ allowed: true });
    expect(reserve).toHaveBeenCalledWith("reserve_search_grounding_quota", { p_daily_cap: 2 });
  });

  it("enforces exhausted quota", async () => {
    reserve.mockResolvedValue({ data: false, error: null });
    expect(await incrementAndCheckSearchGroundingQuota()).toEqual({ allowed: false, reason: "quota" });
  });

  it("fails closed with missing service configuration", async () => {
    getEnv.mockReturnValue(null);
    expect(await incrementAndCheckSearchGroundingQuota()).toEqual({ allowed: false, reason: "quota_unavailable" });
    expect(reserve).not.toHaveBeenCalled();
  });

  it.each(["garbage", "-1", "1.2", "0", ""])("rejects invalid cap %s", async cap => {
    vi.stubEnv("SEARCH_GROUNDING_DAILY_CAP", cap);
    expect(await incrementAndCheckSearchGroundingQuota()).toEqual({ allowed: false, reason: "disabled" });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("fails closed on RPC errors and missing response", async () => {
    reserve.mockResolvedValueOnce({ data: null, error: { message: "missing rpc" } });
    expect(await incrementAndCheckSearchGroundingQuota()).toEqual({ allowed: false, reason: "quota_unavailable" });
    reserve.mockResolvedValueOnce({ data: null, error: null });
    expect(await incrementAndCheckSearchGroundingQuota()).toEqual({ allowed: false, reason: "quota_unavailable" });
    reserve.mockRejectedValueOnce(new Error("network"));
    expect(await incrementAndCheckSearchGroundingQuota()).toEqual({ allowed: false, reason: "quota_unavailable" });
  });
});
