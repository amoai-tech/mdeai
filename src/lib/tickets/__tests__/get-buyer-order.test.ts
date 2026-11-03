import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const secondEq = vi.fn(() => ({ maybeSingle }));
const firstEq = vi.fn(() => ({ eq: secondEq }));
const select = vi.fn(() => ({ eq: firstEq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));

import { getBuyerOrderForUser } from "../get-buyer-order";

const ORDER_ID = "c164ba66-7e51-4ba4-be34-690180248d1c";

describe("getBuyerOrderForUser", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    secondEq.mockClear();
    firstEq.mockClear();
    select.mockClear();
    from.mockClear();
  });

  it("scopes the query to both the order id and the signed-in buyer", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: ORDER_ID, access_token: "secret" },
      error: null,
    });

    const result = await getBuyerOrderForUser(ORDER_ID, "buyer-a");

    expect(result).toEqual({
      status: "ok",
      value: { orderId: ORDER_ID, accessToken: "secret" },
    });
    expect(firstEq).toHaveBeenCalledWith("id", ORDER_ID);
    expect(secondEq).toHaveBeenCalledWith("buyer_user_id", "buyer-a");
  });

  it("returns null for a missing or foreign row", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getBuyerOrderForUser(ORDER_ID, "buyer-b");

    expect(result).toEqual({ status: "ok", value: null });
  });

  it("does not query at all for a malformed id", async () => {
    const result = await getBuyerOrderForUser("not-a-uuid", "buyer-a");

    expect(result).toEqual({ status: "ok", value: null });
    expect(from).not.toHaveBeenCalled();
  });

  it("maps a query failure to an error result", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await getBuyerOrderForUser(ORDER_ID, "buyer-a");

    expect(result.status).toBe("error");
  });
});
