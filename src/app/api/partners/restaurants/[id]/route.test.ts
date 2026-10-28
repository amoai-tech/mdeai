import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, rpc } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: auth }, rpc }),
}));

import { PATCH } from "./route";

const RESTAURANT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const PARTNER = "02597e4d-4852-4584-9c44-35048e75be40";

function patch(body: unknown, id = RESTAURANT) {
  return PATCH(
    new Request(`http://localhost/api/partners/restaurants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } } });
  rpc.mockReset().mockResolvedValue({
    data: {
      restaurantId: RESTAURANT,
      partnerId: PARTNER,
      updatedAt: "2026-10-27T00:00:00Z",
      listing: { name: "Cafe", description: "Updated" },
    },
    error: null,
  });
});

describe("SAN-1540 restaurant listing PATCH", () => {
  it("requires authentication", async () => {
    auth.mockResolvedValue({ data: { user: null } });
    expect((await patch({ description: "x" })).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid restaurant id before the RPC", async () => {
    expect((await patch({ description: "x" }, "not-a-uuid")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects assignment and administrative fields before the RPC", async () => {
    for (const body of [{ partner_id: PARTNER }, { is_active: false }, { is_verified: true }]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves only the edited fields through the authorized RPC", async () => {
    const response = await patch({ partnerId: PARTNER, description: " Updated " });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("restaurant_owner_patch", {
      p_restaurant_id: RESTAURANT,
      p_patch: { description: "Updated" },
      p_partner_id: PARTNER,
    });
    expect(await response.json()).toMatchObject({
      success: true,
      restaurantId: RESTAURANT,
      listing: { name: "Cafe" },
    });
  });

  it("maps authorization, missing rows and validation errors truthfully", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    expect((await patch({ description: "x" })).status).toBe(403);

    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "missing" } });
    expect((await patch({ description: "x" })).status).toBe(404);

    rpc.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "restaurant_owner_patch: invalid website" },
    });
    const invalid = await patch({ description: "x" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { message: "invalid website" },
    });

    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect((await patch({ description: "x" })).status).toBe(500);
  });
});
