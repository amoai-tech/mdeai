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
