import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, rpc } = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: auth }, rpc }),
}));

import { PATCH } from "./route";

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/partners/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } } });
  rpc.mockReset().mockResolvedValue({
    data: { partnerId: "partner-1", settings: { businessName: "Café Central" } },
    error: null,
  });
});

describe("SAN-814 partner profile PATCH", () => {
  it("requires authentication", async () => {
    auth.mockResolvedValue({ data: { user: null } });
    expect((await patch({ businessName: "Café Central" })).status).toBe(401);
  });

  it("rejects invalid or privileged fields before the RPC", async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ status: "active" })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("merges only the submitted fields through the atomic RPC", async () => {
    const response = await patch({ businessName: "Café Central" });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("partner_profile_patch", {
      p_patch: { businessName: "Café Central" },
    });
    expect(await response.json()).toMatchObject({
      success: true,
      partnerId: "partner-1",
    });
  });

  it("maps membership, authorization and multiple-partner errors truthfully", async () => {
    for (const [code, status] of [
      ["P0002", 404],
      ["42501", 403],
      ["P0003", 409],
      ["22023", 400],
      ["XX000", 500],
    ] as const) {
      rpc.mockResolvedValueOnce({ data: null, error: { code } });
      expect((await patch({ businessName: "Café Central" })).status).toBe(status);
    }
  });

  it("fails when the RPC returns no usable row", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await patch({ businessName: "Café Central" })).status).toBe(500);
  });
});
