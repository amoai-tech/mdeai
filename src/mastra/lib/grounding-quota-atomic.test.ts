import { describe, expect, it, vi, beforeEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/service-env", () => ({
  getSupabaseServiceEnv: () => ({ url: "https://test.supabase.co", serviceRoleKey: "test-key" }),
}));

import { incrementAndCheckGroundingQuota } from "./grounding-quota";

describe("incrementAndCheckGroundingQuota atomic reserve", () => {
  beforeEach(() => rpc.mockReset());

  it("uses the database RPC for a successful reservation", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(incrementAndCheckGroundingQuota()).resolves.toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledWith("reserve_places_grounding_quota", { p_daily_cap: 200 });
  });

  it("blocks when the atomic cap rejects", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(incrementAndCheckGroundingQuota()).resolves.toEqual({ allowed: false, reason: "quota" });
  });

  it("fails closed when the reserve RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(incrementAndCheckGroundingQuota()).resolves.toEqual({ allowed: false, reason: "quota_unavailable" });
  });
});
