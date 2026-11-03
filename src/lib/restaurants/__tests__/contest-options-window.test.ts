import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({ rpc }),
}));

import { fetchRestaurantContestOptions } from "../fetch-restaurant-by-id";

const restaurant = "ade2d416-1250-4edb-b131-59691910e8e1";
const contest = "d1520000-0000-0000-0000-000000000331";
const entity = "e1520000-0000-0000-0000-000000000331";

describe("restaurant contest options window", () => {
  beforeEach(() => rpc.mockReset());

  it("carries the real window so the vote panel can hide a non-open contest", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          contest_id: contest,
          entity_id: entity,
          contest_title: "Dev smoke",
          status: "draft",
          starts_at: "2026-10-14T09:34:15.822228+00:00",
          ends_at: "2026-10-15T09:34:15.822228+00:00",
        },
      ],
      error: null,
    });

    await expect(fetchRestaurantContestOptions(restaurant)).resolves.toEqual([
      {
        contestId: contest,
        entityId: entity,
        contestTitle: "Dev smoke",
        status: "draft",
        startsAt: "2026-10-14T09:34:15.822228+00:00",
        endsAt: "2026-10-15T09:34:15.822228+00:00",
      },
    ]);
  });

  it("treats a missing or malformed window as unknown, never as open", async () => {
    rpc.mockResolvedValue({
      data: [{ contest_id: contest, entity_id: entity, status: "live", starts_at: 123, ends_at: {} }],
      error: null,
    });

    const [option] = await fetchRestaurantContestOptions(restaurant);
    expect(option.startsAt).toBeNull();
    expect(option.endsAt).toBeNull();
    expect(option.contestTitle).toBe("Contest");
  });

  it("returns an empty list when the canonical read fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchRestaurantContestOptions(restaurant)).resolves.toEqual([]);
  });
});
