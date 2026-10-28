import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const inRestaurants = vi.fn();
const selectRestaurants = vi.fn(() => ({ in: inRestaurants }));
const from = vi.fn(() => ({ select: selectRestaurants }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({ rpc, from }),
}));

import { getPublicContest } from "../contest-public";

const contestRow = {
  id: "9dacc103-63c1-4e3d-be81-f830532c4e1f",
  slug: "medellins-peoples-choice",
  title: "Medellins peoples choice",
  description: "A real description",
  status: "draft",
  starts_at: "2026-10-18T09:37:57Z",
  ends_at: "2027-02-15T09:37:57Z",
  cover_url: null,
};

function nomineeRow(restaurantId: string) {
  return {
    entity_id: "entity-" + restaurantId,
    restaurant_id: restaurantId,
    restaurant_name: "Restaurant " + restaurantId,
    neighborhood: "Laureles",
    image_url: null,
    category: null,
    audience_accepted: 0,
    development_test_total: 0,
    rank: null,
  };
}

describe("contest public read: nominee coordinates", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
    selectRestaurants.mockClear();
    inRestaurants.mockReset();
  });

  it("attaches catalog coordinates without widening the contest RPC payload", async () => {
    rpc.mockResolvedValue({
      data: { contest: contestRow, nominees: [nomineeRow("a"), nomineeRow("b")] },
      error: null,
    });
    inRestaurants.mockResolvedValue({
      data: [
        { id: "a", latitude: 6.209964, longitude: -75.565669 },
        { id: "b", latitude: null, longitude: null },
      ],
      error: null,
    });

    const result = await getPublicContest("medellins-peoples-choice");
    expect(result.status).toBe("found");
    if (result.status !== "found") return;

    expect(result.nominees.map((nominee) => [nominee.restaurantId, nominee.latitude, nominee.longitude])).toEqual([
      ["a", 6.209964, -75.565669],
      ["b", null, null],
    ]);
    // One read for every nominee, never one per card.
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("restaurants");
    expect(selectRestaurants).toHaveBeenCalledWith("id, latitude, longitude");
    expect(inRestaurants).toHaveBeenCalledWith("id", ["a", "b"]);
  });

  it("keeps the ballot when the coordinate read fails", async () => {
    rpc.mockResolvedValue({
      data: { contest: contestRow, nominees: [nomineeRow("a")] },
      error: null,
    });
    inRestaurants.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await getPublicContest("medellins-peoples-choice");
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.nominees).toHaveLength(1);
    expect(result.nominees[0].latitude).toBeNull();
    expect(result.nominees[0].longitude).toBeNull();
  });

  it("treats a malformed coordinate as no location instead of publishing it", async () => {
    rpc.mockResolvedValue({
      data: { contest: contestRow, nominees: [nomineeRow("a"), nomineeRow("b")] },
      error: null,
    });
    inRestaurants.mockResolvedValue({
      data: [
        { id: "a", latitude: "6.2", longitude: 999 },
        { id: "b", latitude: Number.NaN, longitude: undefined },
      ],
      error: null,
    });

    const result = await getPublicContest("medellins-peoples-choice");
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.nominees.every((nominee) => nominee.latitude === null)).toBe(true);
    expect(result.nominees.every((nominee) => nominee.longitude === null)).toBe(true);
  });

  it("skips the coordinate read when the ballot is empty", async () => {
    rpc.mockResolvedValue({ data: { contest: contestRow, nominees: [] }, error: null });

    const result = await getPublicContest("medellins-peoples-choice");
    expect(result.status).toBe("found");
    expect(from).not.toHaveBeenCalled();
  });
});
