import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));

import { getAdminGate, requireAdminId } from "../auth/admin-gate";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("contest admin server gate", () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
  });

  it("reports a guest when there is no verified session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(getAdminGate()).resolves.toEqual({ status: "guest" });
    // No role lookup without a user.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows both admin and super_admin through the canonical is_admin()", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    rpc.mockResolvedValue({ data: true });
    await expect(getAdminGate()).resolves.toEqual({ status: "ok", userId: USER_ID });
    expect(rpc).toHaveBeenCalledWith("is_admin");
    await expect(requireAdminId()).resolves.toBe(USER_ID);
  });

  it("denies an ordinary signed-in customer or partner", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    rpc.mockResolvedValue({ data: false });
    await expect(getAdminGate()).resolves.toEqual({ status: "denied", userId: USER_ID });
    await expect(requireAdminId()).rejects.toThrow("Admin access required.");
  });

  it("distinguishes a role-lookup failure from an ordinary denial", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(getAdminGate()).resolves.toEqual({
      status: "error",
      message: "We could not verify admin access. Try again.",
    });
    await expect(requireAdminId()).rejects.toThrow(
      "We could not verify admin access. Try again.",
    );
  });

  it("fails closed when the role lookup returns anything but true", async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    rpc.mockResolvedValue({ data: null });
    await expect(getAdminGate()).resolves.toEqual({ status: "denied", userId: USER_ID });
    await expect(requireAdminId()).rejects.toThrow("Admin access required.");
  });

  it("refuses a write before any service-role call when the session is missing", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireAdminId()).rejects.toThrow("Sign in as an admin to manage contests.");
    expect(rpc).not.toHaveBeenCalled();
  });
});
