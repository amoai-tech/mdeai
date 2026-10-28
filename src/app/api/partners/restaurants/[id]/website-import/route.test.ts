import { beforeEach, describe, expect, it, vi } from "vitest";
const { auth, rpc, from, restaurantLookup, memberLookup, extract, limiter } = vi.hoisted(() => ({
  auth: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  restaurantLookup: vi.fn(), memberLookup: vi.fn(), extract: vi.fn(), limiter: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: auth }, rpc, from }),
}));
vi.mock("@/lib/distributed-rate-limit", () => ({ checkRateLimitDurable: limiter }));
vi.mock("@/lib/restaurants/website-import", () => ({
  extractRestaurantWebsiteDraft: extract,
  RestaurantWebsiteImportError: class RestaurantWebsiteImportError extends Error {},
}));
import { POST } from "./route";
const RESTAURANT = "a1540000-0000-4000-8000-000000000031";
const PARTNER = "a1540000-0000-4000-8000-000000000011";
function request(id = RESTAURANT) {
  return POST(new Request(`http://localhost/api/partners/restaurants/${id}/website-import`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://restaurant.example" }),
  }), { params: Promise.resolve({ id }) });
}
beforeEach(() => {
  auth.mockReset().mockResolvedValue({ data: { user: { id: "owner-a" } } });
  rpc.mockReset().mockResolvedValue({ data: false, error: null });
  restaurantLookup.mockReset().mockResolvedValue({
    data: { id: RESTAURANT, partner_id: PARTNER }, error: null,
  });
  memberLookup.mockReset().mockResolvedValue({ data: [{ partner_id: PARTNER }], error: null });
  extract.mockReset().mockResolvedValue({ name: "Restaurant Example" });
  limiter.mockReset().mockResolvedValue({
    allowed: true, storeAvailable: true, count: 1, max: 10, retryAfterSeconds: 0,
  });
  from.mockReset().mockImplementation((table: string) => ({
    select: () => ({
      eq: () => table === "restaurants" ? { maybeSingle: restaurantLookup } : memberLookup(),
    }),
  }));
});
describe("restaurant website import authorization", () => {
  it("rejects guests before calling AI", async () => {
    auth.mockResolvedValue({ data: { user: null } });
    expect((await request()).status).toBe(401);
    expect(extract).not.toHaveBeenCalled();
    expect(limiter).not.toHaveBeenCalled();
  });
  it("rejects nonmembers even when the restaurant is publicly readable", async () => {
    memberLookup.mockResolvedValue({ data: [], error: null });
    expect((await request()).status).toBe(403);
    expect(extract).not.toHaveBeenCalled();
    expect(limiter).not.toHaveBeenCalled();
  });
  it("permits assigned members and returns the proposal", async () => {
    expect((await request()).status).toBe(200);
    expect(extract).toHaveBeenCalledWith("https://restaurant.example");
    expect(limiter).toHaveBeenCalledWith("restaurant-website-import:user:owner-a", 10, 3600);
  });
  it("permits admins without membership", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    memberLookup.mockResolvedValue({ data: [], error: null });
    expect((await request()).status).toBe(200);
  });
  it("rejects an exceeded quota before calling Gemini with Retry-After", async () => {
    limiter.mockResolvedValue({
      allowed: false, storeAvailable: true, count: 11, max: 10, retryAfterSeconds: 145,
    });
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("145");
    expect(extract).not.toHaveBeenCalled();
  });
  it("fails closed when the distributed limiter is unavailable", async () => {
    limiter.mockResolvedValue({ allowed: true, storeAvailable: false });
    const response = await request();
    expect(response.status).toBe(503);
    expect(extract).not.toHaveBeenCalled();
  });
  it("fails closed on a membership read error", async () => {
    memberLookup.mockResolvedValue({ data: null, error: { code: "PGRST" } });
    expect((await request()).status).toBe(500);
    expect(extract).not.toHaveBeenCalled();
    expect(limiter).not.toHaveBeenCalled();
  });
});
