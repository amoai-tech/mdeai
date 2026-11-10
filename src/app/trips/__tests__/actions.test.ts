import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } })),
);

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    rpc,
  })),
}));

import { addTripItem } from "../actions";

describe("addTripItem unknown place", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("saves a source-backed restaurant even when it has no coordinates", async () => {
    rpc.mockResolvedValueOnce({
      data: "33333333-3333-4333-8333-333333333333",
      error: null,
    });

    const result = await addTripItem({
      tripId: "22222222-2222-4222-8222-222222222222",
      pinId: "restaurant-44444444-4444-4444-8444-444444444444",
      category: "restaurant",
    });

    expect(result).toEqual({
      ok: true,
      itemId: "33333333-3333-4333-8333-333333333333",
    });
    expect(rpc).toHaveBeenCalledWith("insert_trip_item_for_user", {
      p_trip_id: "22222222-2222-4222-8222-222222222222",
      p_item_type: "restaurant",
      p_source_id: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("rejects an uncatalogued Place ID without calling the trip RPC", async () => {
    const result = await addTripItem({
      tripId: "22222222-2222-4222-8222-222222222222",
      pinId: "grounded-unknown",
      placeId: "ChIJ-not-in-the-mde-catalog",
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.error).toMatch(/saved place catalog/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
