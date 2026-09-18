import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchRentals } from "@/mastra/tools/search-rentals";
import { getRentalDetail, mapApartmentRowToDetail } from "../get-rental-detail";

vi.mock("@/mastra/tools/search-rentals", () => ({
  searchRentals: vi.fn(),
}));

/**
 * `getRentalDetail` only falls back to the mock catalogue when **no** Supabase
 * credential name resolves. MDE-ENV-002 made the server accept the public names
 * too, so clearing the server-only pair is no longer sufficient — CI sets
 * `NEXT_PUBLIC_SUPABASE_URL`, which would otherwise build a real client.
 */
const CREDENTIAL_NAMES = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const env = process.env as Record<string, string | undefined>;
const savedCredentials = new Map<string, string | undefined>();

beforeEach(() => {
  savedCredentials.clear();
  for (const name of CREDENTIAL_NAMES) {
    savedCredentials.set(name, env[name]);
    delete env[name];
  }
  vi.mocked(searchRentals).mockReset();
});

afterEach(() => {
  for (const [name, value] of savedCredentials) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  savedCredentials.clear();
});

describe("SAN-1202 · mapApartmentRowToDetail", () => {
  it("maps a full apartments row to the detail view-model", () => {
    const rentalDetail = mapApartmentRowToDetail({
      id: "abc",
      slug: "laureles-2br",
      title: "Bright Laureles 2BR",
      neighborhood: "Laureles",
      address: "Cra 70 #1-23",
      bedrooms: 2,
      bathrooms: 1,
      price_daily: 80,
      price_monthly: 2400,
      currency: "USD",
      deposit_amount: 500,
      amenities: ["wifi", "ac"],
      building_amenities: ["gym"],
      images: ["a.jpg", "b.jpg"],
      available_from: "2026-07-01",
      minimum_stay_days: 30,
      latitude: 6.24,
      longitude: -75.6,
      status: "active",
    });
    expect(rentalDetail.id).toBe("abc");
    expect(rentalDetail.bedrooms).toBe(2);
    expect(rentalDetail.priceMonthly).toBe(2400);
    expect(rentalDetail.amenities).toEqual(["wifi", "ac"]);
    expect(rentalDetail.buildingAmenities).toEqual(["gym"]);
    expect(rentalDetail.images).toHaveLength(2);
  });

  it("returns null for unknown/blank fields so the UI can show Data pending — never faked", () => {
    const rentalDetail = mapApartmentRowToDetail({ id: "x", title: "Studio", neighborhood: "El Poblado" });
    expect(rentalDetail.bathrooms).toBeNull();
    expect(rentalDetail.maxGuests).toBeNull();
    expect(rentalDetail.priceMonthly).toBeNull();
    expect(rentalDetail.description).toBeNull();
    expect(rentalDetail.houseRules).toBeNull();
    expect(rentalDetail.availableFrom).toBeNull();
    expect(rentalDetail.minimumStayDays).toBeNull();
    expect(rentalDetail.amenities).toEqual([]);
    expect(rentalDetail.images).toEqual([]);
  });

  it("coerces numeric strings and rejects non-finite values", () => {
    const rentalDetail = mapApartmentRowToDetail({
      id: "y",
      title: "T",
      neighborhood: "N",
      price_daily: "95",
      bedrooms: "nope",
    });
    expect(rentalDetail.priceNightly).toBe(95);
    expect(rentalDetail.bedrooms).toBeNull();
  });

  it("matches mock rentals by source_url slug and keeps unknown fields null", async () => {
    vi.mocked(searchRentals).mockResolvedValue({
      total: 1,
      source: "mock",
      results: [
        {
          id: "rnt_lau_001",
          title: "Bright 2BR with Balcony in Laureles",
          neighborhood: "Laureles",
          nightly_price: 78,
          currency: "USD",
          bedrooms: 2,
          wifi: true,
          amenities: ["wifi"],
          image: "",
          source_url: "https://mdeai.co/rentals/laureles-2br-balcony",
          schedule_viewing_url: "https://mdeai.co/rentals/laureles-2br-balcony/schedule-viewing",
          host_name: "Andrés Restrepo",
          availability: "Available now",
          tags: [],
        },
      ],
    });

    const rentalDetail = await getRentalDetail("laureles-2br-balcony");

    expect(rentalDetail?.id).toBe("rnt_lau_001");
    expect(rentalDetail?.priceMonthly).toBeNull();
  });
});
