import { describe, expect, it } from "vitest";
import {
  RENTAL_PANEL_PHOTO_LIMIT,
  rowToRental,
  type ApartmentRow,
} from "@/mastra/tools/search-rentals";

/**
 * A managed listing can hold dozens of photos (Asturias 402 has 76). `rowToRental` used to keep
 * only the first one, so the Details panel beside the list showed a single picture while the
 * full listing page showed the carousel. The panel reads `Rental.images`, so that is what must be
 * filled here.
 */
function photoUrls(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `https://example.supabase.co/storage/v1/object/public/listing-photos/mde-asturias-402/${String(i + 1).padStart(3, "0")}.jpg`,
  );
}

function apartmentRow(images: string[] | null): ApartmentRow {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    title: "Asturias 402",
    neighborhood: "El Poblado",
    bedrooms: 3,
    price_daily: null,
    price_monthly: 2900,
    currency: "USD",
    wifi_speed: null,
    amenities: [],
    images,
    host_name: "SK",
    source_url: null,
    available_from: "2026-10-16",
    available_to: null,
    pet_friendly: false,
    parking_included: false,
    minimum_stay_days: 30,
    slug: "mde-asturias-402",
    latitude: 6.2,
    longitude: -75.57,
    landlord_id: "a4da05ae-347e-4250-8ae0-83812ccc7703",
    status: "active",
    moderation_status: "approved",
    listing_workflow_status: "published",
  };
}

describe("rowToRental — gallery photos for the Details panel", () => {
  it("passes the stored photos through, in order, capped at the panel limit", () => {
    const urls = photoUrls(76);
    const rental = rowToRental(apartmentRow(urls));

    expect(RENTAL_PANEL_PHOTO_LIMIT).toBe(12);
    expect(rental.images).toHaveLength(RENTAL_PANEL_PHOTO_LIMIT);
    expect(rental.images).toEqual(urls.slice(0, RENTAL_PANEL_PHOTO_LIMIT));
  });

  it("keeps `image` as the first photo of the gallery", () => {
    const urls = photoUrls(5);
    const rental = rowToRental(apartmentRow(urls));

    expect(rental.image).toBe(urls[0]);
    expect(rental.images?.[0]).toBe(rental.image);
    expect(rental.images).toHaveLength(5);
  });

  it("shows a single stored photo as a one-photo gallery", () => {
    const urls = photoUrls(1);
    const rental = rowToRental(apartmentRow(urls));

    expect(rental.image).toBe(urls[0]);
    expect(rental.images).toEqual(urls);
  });

  it("leaves `images` absent and `image` empty when the listing has no photos", () => {
    expect(rowToRental(apartmentRow([])).images).toBeUndefined();
    expect(rowToRental(apartmentRow([])).image).toBe("");
    expect(rowToRental(apartmentRow(null)).images).toBeUndefined();
  });

  it("ignores empty photo entries instead of showing a blank slide", () => {
    const [first, second] = photoUrls(2);
    const rental = rowToRental(apartmentRow([first, "", second]));

    expect(rental.images).toEqual([first, second]);
  });
});
