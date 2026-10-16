import { describe, expect, it } from "vitest";
import { isAvailabilityUnconfirmed } from "@/lib/rentals/provenance";
import { mapApartmentRowToDetail } from "@/lib/rentals/get-rental-detail";
import { rowToRental, type ApartmentRow } from "@/mastra/tools/search-rentals";

/**
 * SAN-1503: the 15 imported apartments carry a stored `available_from`. For 11 of them the source
 * never stated a move-in date, so showing "Available from Oct 14" would invite Camila to plan
 * around a date nobody promised. These rows are marked in metadata; every surface must say
 * "Availability unconfirmed" for them and keep showing the source-stated dates for the other four.
 */
const unconfirmed = {
  available_from_basis: "source_for_rent_dates_unconfirmed",
  available_from_independently_confirmed: false,
};
const stated = {
  available_from_basis: "source_explicit_date",
  available_from_independently_confirmed: false,
};

function apartment(metadata: unknown, availableFrom = "2026-10-14"): ApartmentRow {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    title: "WE Home",
    neighborhood: "El Poblado",
    bedrooms: 2,
    price_daily: null,
    price_monthly: 14500000,
    currency: "COP",
    wifi_speed: null,
    amenities: [],
    images: [],
    host_name: "SK",
    source_url: null,
    available_from: availableFrom,
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    slug: "mde-we-home",
    latitude: 6.2,
    longitude: -75.57,
    landlord_id: "a4da05ae-347e-4250-8ae0-83812ccc7703",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
    metadata,
  };
}

describe("isAvailabilityUnconfirmed", () => {
  it("is true for every placeholder basis", () => {
    for (const basis of [
      "source_for_rent_dates_unconfirmed",
      "source_rented_until_past_recheck",
      "source_available_now",
    ]) {
      expect(
        isAvailabilityUnconfirmed({ available_from_basis: basis, available_from_independently_confirmed: false }),
      ).toBe(true);
    }
  });

  it("is false for a source-stated date, an ordinary listing, or junk metadata", () => {
    expect(isAvailabilityUnconfirmed(stated)).toBe(false);
    expect(isAvailabilityUnconfirmed({ available_from_basis: "source_rented_until", available_from_independently_confirmed: false })).toBe(false);
    expect(isAvailabilityUnconfirmed({})).toBe(false);
    expect(isAvailabilityUnconfirmed(null)).toBe(false);
    expect(isAvailabilityUnconfirmed("x")).toBe(false);
    // A date an owner later confirmed must show again.
    expect(isAvailabilityUnconfirmed({ ...unconfirmed, available_from_independently_confirmed: true })).toBe(false);
  });
});

describe("rowToRental availability text", () => {
  it("says 'Availability unconfirmed' instead of the placeholder date", () => {
    expect(rowToRental(apartment(unconfirmed)).availability).toBe("Availability unconfirmed");
  });

  it("keeps the source-stated date, and ordinary listings, unchanged", () => {
    expect(rowToRental(apartment(stated, "2026-11-01")).availability).toMatch(/^Available from .*2026/);
    expect(rowToRental(apartment({})).availability).toMatch(/^Available from /);
  });

  it("does not stop the viewing request: an unconfirmed date is still requestable", () => {
    expect(rowToRental(apartment(unconfirmed)).can_schedule_viewing).toBe(true);
  });
});

describe("mapApartmentRowToDetail availability", () => {
  const row = (metadata: unknown) => ({
    id: "abc",
    slug: "mde-we-home",
    title: "WE Home",
    available_from: "2026-10-14",
    metadata,
  });

  it("drops the placeholder date so the listing calendar shows 'Availability data pending'", () => {
    expect(mapApartmentRowToDetail(row(unconfirmed)).availableFrom).toBeNull();
  });

  it("keeps a stated date", () => {
    expect(mapApartmentRowToDetail(row(stated)).availableFrom).toBe("2026-10-14");
  });

  // The label is display only. Whether a renter may ask for a viewing is the database's call
  // (`rental_can_request_viewing`), and a placeholder date must not flip it either way.
  it("leaves the database's viewing decision untouched", () => {
    const yes = mapApartmentRowToDetail({ ...row(unconfirmed), rental_can_request_viewing: true });
    const no = mapApartmentRowToDetail({ ...row(unconfirmed), rental_can_request_viewing: false });
    expect(yes.availableFrom).toBeNull();
    expect(yes.canScheduleViewing).toBe(true);
    expect(no.canScheduleViewing).toBe(false);
  });

  it("keeps the not-independently-verified disclosure for a disclosed third-party ad", () => {
    const detail = mapApartmentRowToDetail(
      row({ ...unconfirmed, source_record_type: "third_party_advertisement" }),
    );
    expect(detail.availableFrom).toBeNull();
    expect(detail.isNotIndependentlyVerified).toBe(true);
  });
});
