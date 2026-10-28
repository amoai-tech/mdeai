import { beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }));

const menuQuery = {
  order: () => menuQuery,
  then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle, ...menuQuery }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/server-env", () => ({
  getSupabaseServerAnonEnv: () => ({ url: "https://test.supabase.co", anonKey: "anon-test-key" }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceRoleClient: () => null }));

import { fetchRestaurantById } from "../fetch-restaurant-by-id";

const hotelId = "fc6031d7-dcf6-44c3-9547-f7172c37ee95";
const carreraId = "a1b2c3d4-e5f6-4789-abcd-100000000004";

function restaurantRow(id: string, name = "El Cielo") {
  return {
    id, name, address: id === hotelId ? "Elcielo Hotel, El Poblado" : "Carrera 40 #10A-22",
    neighborhood: "El Poblado", city: "Medellín",
    cuisine_types: ["steakhouse"], price_level: 4, rating: 4.4,
    tags: [], latitude: 6.2, longitude: -75.5,
    primary_image_url: null, google_place_id: null,
    maps_url: null, ai_summary: null,
  };
}

describe("restaurant Details location labels (SAN-1556)", () => {
  beforeEach(() => maybeSingle.mockReset());

  it.each([
    [hotelId, "El Cielo · Elcielo Hotel"],
    [carreraId, "El Cielo · Carrera 40"],
  ])("uses the same distinct label as search for %s", async (id, label) => {
    maybeSingle.mockResolvedValueOnce({ data: restaurantRow(id), error: null });
    const lookup = await fetchRestaurantById(id);
    expect(lookup.status).toBe("found");
    if (lookup.status !== "found") return;
    expect(lookup.restaurant.id).toBe(id);
    expect(lookup.restaurant.name).toBe(label);
  });

  it("does not relabel another restaurant with a similar name", async () => {
    maybeSingle.mockResolvedValueOnce({ data: restaurantRow(hotelId, "El Cielo Café"), error: null });
    const lookup = await fetchRestaurantById(hotelId);
    expect(lookup.status).toBe("found");
    if (lookup.status !== "found") return;
    expect(lookup.restaurant.name).toBe("El Cielo Café");
  });

  it("preserves not-found and database failure states", async () => {
    expect(await fetchRestaurantById("invalid-id")).toEqual({ status: "not_found" });
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchRestaurantById(hotelId)).toEqual({ status: "not_found" });
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    expect(await fetchRestaurantById(hotelId)).toEqual({ status: "error" });
  });
});
