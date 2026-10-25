import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockGetPlace = vi.hoisted(() => vi.fn());

vi.mock("@/mastra/lib/google-places-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mastra/lib/google-places-client")>();
  return { ...actual, getPlace: mockGetPlace };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        in: async () => ({
          data: [{ id: "r1", google_place_id: "ChIJabc" }],
        }),
      }),
    }),
  })),
}));

import {
  enrichRestaurantsWithPlacePhotos,
  prepareRestaurantSearchResults,
} from "@/lib/restaurant-place-photo";

describe("enrichRestaurantsWithPlacePhotos", () => {
  beforeEach(() => {
    mockGetPlace.mockReset();
  });

  it("keeps http imageUrl without calling Places", async () => {
    const out = await enrichRestaurantsWithPlacePhotos([
      { placeId: "x", imageUrl: "https://cdn.example/a.jpg" },
    ]);
    expect(mockGetPlace).not.toHaveBeenCalled();
    expect(out[0]?.imageUrl).toBe("https://cdn.example/a.jpg");
  });

  it("sets proxy URL from first photo when imageUrl empty", async () => {
    mockGetPlace.mockResolvedValue({
      id: "places/ChIJabc",
      photos: [{ name: "places/ChIJabc/photos/photo1" }],
    });

    const out = await enrichRestaurantsWithPlacePhotos([
      { placeId: "ChIJabc", imageUrl: "" },
    ]);

    expect(mockGetPlace).toHaveBeenCalledWith({
      placeId: "ChIJabc",
      fieldMask: ["id", "photos"],
    });
    expect(out[0]?.imageUrl).toMatch(/^\/api\/places\/photo\?/);
  });

  it("respects maxFetches budget", async () => {
    mockGetPlace.mockResolvedValue({
      id: "places/p",
      photos: [{ name: "places/p/photos/1" }],
    });

    await enrichRestaurantsWithPlacePhotos(
      [
        { placeId: "a", imageUrl: "" },
        { placeId: "b", imageUrl: "" },
      ],
      { maxFetches: 1 },
    );

    expect(mockGetPlace).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("prepareRestaurantSearchResults", () => {
  it("skips remote restaurant photo enrichment in deterministic CI", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_E2E_DETERMINISTIC_CHAT", "1");
    const rows = [{ id: "r1", imageUrl: "", placeId: "ChIJabc" }];
    const result = await prepareRestaurantSearchResults(rows as Parameters<typeof prepareRestaurantSearchResults>[0]);
    expect(result).toEqual(rows);
    expect(mockGetPlace).not.toHaveBeenCalled();
  });


  beforeEach(() => {
    mockGetPlace.mockReset();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
  });

  it("attaches placeId then enriches photo", async () => {
    mockGetPlace.mockResolvedValue({
      id: "places/ChIJabc",
      photos: [{ name: "places/ChIJabc/photos/photo1" }],
    });

    const out = await prepareRestaurantSearchResults([
      {
        id: "r1",
        name: "Test",
        cuisine: "international",
        neighborhood: "Laureles",
        priceTier: "$$",
        avgPricePerPerson: 20,
        currency: "USD",
        rating: 4,
        vibe: [],
        imageUrl: "",
        sourceUrl: "https://mdeai.co/r1",
        placeId: null,
      },
    ]);

    expect(out[0]?.placeId).toBe("ChIJabc");
    expect(out[0]?.imageUrl).toMatch(/^\/api\/places\/photo\?/);
  });
});
