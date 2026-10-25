import { beforeEach, describe, expect, it, vi } from "vitest";

const order = vi.fn();
const is = vi.fn(() => ({ order }));
const eq = vi.fn(() => ({ is }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));

import { loadUserCollections } from "../load-user-collections";

describe("loadUserCollections", () => {
  beforeEach(() => {
    order.mockReset();
    is.mockClear();
    eq.mockClear();
    select.mockClear();
    from.mockClear();
  });

  it("maps a query failure to an error result, never an empty list", async () => {
    order.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await loadUserCollections("user-a");

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/couldn't load/i);
    }
    expect(from).toHaveBeenCalledWith("collections");
    expect(eq).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("returns ok with zero rows only after a successful query", async () => {
    order.mockResolvedValue({ data: [], error: null });

    const result = await loadUserCollections("user-a");

    expect(result).toEqual({ status: "ok", value: [] });
  });
});
