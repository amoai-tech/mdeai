import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RentalSearchUnavailableError } from "@/mastra/lib/rental-search-unavailable";
import { getRentalDetail, mapApartmentRowToDetail } from "../get-rental-detail";

/**
 * `getRentalDetail` has no demo catalogue (SAN-1089): when **no** Supabase
 * credential name resolves it throws instead of inventing a rental. MDE-ENV-002 made the server accept the public names
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
});

afterEach(() => {
  for (const [name, value] of savedCredentials) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  savedCredentials.clear();
});

describe("SAN-1202 · mapApartmentRowToDetail", () => {
  it("discloses a third-party advertisement as unverified without blocking Phase A viewing", () => {
    const detail = mapApartmentRowToDetail({
      id: "external-001",
      status: "active",
      title: "Laureles apartment",
      source_url: "https://www.fincaraiz.com.co/example",
      metadata: { source_record_type: "third_party_advertisement", availability_status: "unconfirmed" },
      available_from: null,
      rental_can_request_viewing: true,
    });
    expect(detail.isNotIndependentlyVerified).toBe(true);
    expect(detail.sourceUrl).toBe("https://www.fincaraiz.com.co/example");
    expect(detail.availableFrom).toBeNull();
    expect(detail.canScheduleViewing).toBe(true);
  });


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

  // SAN-1502 — requestability has exactly ONE owner: the database's computed
  // `rental_can_request_viewing` column, evaluated under the server-controlled phase.
  // Details must not re-derive it from ownership/workflow/availability columns, and it
  // fails closed when the projection did not return the column.
  describe("canScheduleViewing", () => {
    const someRow = { id: "abc", title: "Bright Laureles 2BR", neighborhood: "Laureles" };

    it("is true only when the database computed the row requestable", () => {
      expect(mapApartmentRowToDetail({ ...someRow, rental_can_request_viewing: true }).canScheduleViewing).toBe(true);
    });

    it("is false when the database computed it not requestable", () => {
      expect(mapApartmentRowToDetail({ ...someRow, rental_can_request_viewing: false }).canScheduleViewing).toBe(false);
    });

    it("fails closed when the computed column is absent from the row", () => {
      expect(mapApartmentRowToDetail(someRow).canScheduleViewing).toBe(false);
      expect(mapApartmentRowToDetail({ id: "x", title: "Studio", neighborhood: "El Poblado" }).canScheduleViewing).toBe(false);
    });
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

  it("throws RentalSearchUnavailableError — never a demo rental — when no Supabase credentials resolve", async () => {
    await expect(getRentalDetail("rnt_lau_001")).rejects.toBeInstanceOf(RentalSearchUnavailableError);
    await expect(getRentalDetail("laureles-2br-balcony")).rejects.toBeInstanceOf(
      RentalSearchUnavailableError,
    );
  });
});
