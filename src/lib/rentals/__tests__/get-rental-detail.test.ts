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

  // SAN-1349 — the detail page must not offer a viewing request for a listing the database
  // would reject. Requestability is derived from the same ownership + workflow + availability
  // proof, and fails closed when any part of it is missing.
  describe("canScheduleViewing", () => {
    const ownedRow = {
      id: "abc",
      title: "Bright Laureles 2BR",
      neighborhood: "Laureles",
      status: "active",
      moderation_status: "approved",
      listing_workflow_status: "published",
      landlord_id: "11111111-1111-4111-8111-111111111111",
      available_from: "2026-01-01", // a known move-in date, as the viewing RPC requires (SAN-486)
      available_to: null,
    };

    it("is true for an owned, active, approved, published, available listing", () => {
      expect(mapApartmentRowToDetail(ownedRow).canScheduleViewing).toBe(true);
    });

    it("is false when the listing has no canonical owner", () => {
      expect(mapApartmentRowToDetail({ ...ownedRow, landlord_id: null }).canScheduleViewing).toBe(false);
    });

    it("is false when the listing is unapproved or unpublished", () => {
      expect(
        mapApartmentRowToDetail({ ...ownedRow, moderation_status: "pending" }).canScheduleViewing,
      ).toBe(false);
      expect(
        mapApartmentRowToDetail({ ...ownedRow, listing_workflow_status: "draft" }).canScheduleViewing,
      ).toBe(false);
    });

    it("allows an active development fixture even without approval paperwork or move-in date", () => {
      const fixture = { ...ownedRow, metadata: { is_test_fixture: true },
        moderation_status: "pending", listing_workflow_status: "draft",
        available_from: null, available_to: null };
      expect(mapApartmentRowToDetail(fixture).canScheduleViewing).toBe(true);
      expect(mapApartmentRowToDetail({ ...fixture, status: "inactive" }).canScheduleViewing).toBe(false);
    });

    it("does not advertise expired development apartments as requestable", () => {
      const fixture = {
        ...ownedRow,
        metadata: { is_test_fixture: true },
        moderation_status: "pending",
        listing_workflow_status: "draft",
        available_from: null,
        available_to: "2026-10-14",
      };
      // These assertions use the calendar date of 2026-10-16 in Bogotá.
      // Expired fixture must be denied in Details just as in rental search.
      expect(mapApartmentRowToDetail(fixture).canScheduleViewing).toBe(false);
    });

    it("fails closed when the ownership columns are absent from the row", () => {
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
