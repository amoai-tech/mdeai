import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveTripSource } from "../resolve-trip-source";


function client(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => responses[table] ?? { data: null, error: null },
              };
            },
          };
        },
      };
    },
  } as never;
}

describe("resolveTripSource", () => {
  const rentalId = "11111111-1111-4111-8111-111111111111";
  const restaurantId = "22222222-2222-4222-8222-222222222222";
  const venueId = "33333333-3333-4333-8333-333333333333";

  it("resolves prefixed MDE pins without a Place ID lookup", async () => {
    const supabase = client({});
    await expect(resolveTripSource(supabase, { pinId: `rental-${rentalId}` })).resolves.toEqual({
      ok: true,
      source: { itemType: "rental", sourceId: rentalId },
    });
    await expect(resolveTripSource(supabase, { pinId: `restaurant-${restaurantId}` })).resolves.toEqual({
      ok: true,
      source: { itemType: "restaurant", sourceId: restaurantId },
    });
    await expect(resolveTripSource(supabase, { pinId: `venue-${venueId}` })).resolves.toEqual({
      ok: true,
      source: { itemType: "venue", sourceId: venueId },
    });
  });

  it("resolves a Google Place ID through restaurants then venue anchors", async () => {
    const restaurant = client({
      restaurants: { data: { id: restaurantId }, error: null },
    });
    await expect(
      resolveTripSource(restaurant, { pinId: "grounded-x", placeId: "ChIJ-restaurant" }),
    ).resolves.toEqual({
      ok: true,
      source: { itemType: "restaurant", sourceId: restaurantId },
    });

    const venue = client({
      restaurants: { data: null, error: null },
      venue_anchors: { data: { id: venueId }, error: null },
    });
    await expect(
      resolveTripSource(venue, { pinId: "grounded-y", placeId: "ChIJ-cafe" }),
    ).resolves.toEqual({
      ok: true,
      source: { itemType: "venue", sourceId: venueId },
    });
  });

  it("refuses an unknown or fabricated source", async () => {
    const supabase = client({
      restaurants: { data: null, error: null },
      venue_anchors: { data: null, error: null },
    });
    await expect(
      resolveTripSource(supabase, { pinId: "grounded-z", placeId: "ChIJ-unknown" }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      resolveTripSource(supabase, { pinId: "not-a-prefixed-id" }),
    ).resolves.toMatchObject({ ok: false });
  });
});
