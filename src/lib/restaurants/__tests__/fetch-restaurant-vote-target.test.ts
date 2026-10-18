import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

import { fetchRestaurantVoteTarget } from "../fetch-restaurant-by-id";

const restaurant = "ade2d416-1250-4edb-b131-59691910e8e1";
const contest = "d1520000-0000-0000-0000-000000000331";
const otherContest = "9dacc103-63c1-4e3d-be81-f830532c4e1f";
const entity = "e1520000-0000-0000-0000-000000000331";

describe("restaurant vote target: explicit contest", () => {
  beforeEach(() => rpc.mockReset());

  it("passes the selected contest to the canonical server-only RPC", async () => {
    rpc.mockResolvedValue({ data: { contest_id: contest, entity_id: entity }, error: null });
    expect(await fetchRestaurantVoteTarget(restaurant, contest)).toEqual({ contestId: contest, entityId: entity });
    expect(rpc).toHaveBeenCalledWith("vote_restaurant_target", {
      p_restaurant_id: restaurant, p_contest_id: contest,
    });
  });

  it("does not choose an arbitrary contest when none is selected", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchRestaurantVoteTarget(restaurant)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("vote_restaurant_target", {
      p_restaurant_id: restaurant,
    });
  });

  it("rejects invalid contest identifiers before querying", async () => {
    expect(await fetchRestaurantVoteTarget(restaurant, "not-a-uuid")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not swap to a different contest when the server rejects a mismatched pair", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchRestaurantVoteTarget(restaurant, otherContest)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("vote_restaurant_target", {
      p_restaurant_id: restaurant, p_contest_id: otherContest,
    });
  });
});
