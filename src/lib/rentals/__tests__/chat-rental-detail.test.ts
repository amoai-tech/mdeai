import { describe, expect, it } from "vitest";
import { toDetailRental } from "@/lib/rentals/chat-rental-detail";

/** One row exactly as the rental search tool returns it (see `rentalSchema`). */
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Furnished apartment in Laureles",
  neighborhood: "Laureles",
  nightly_price: 0,
  currency: "COP",
  bedrooms: 2,
  wifi: false,
  amenities: ["workspace"],
  image: "https://example.test/a.webp",
  images: ["https://example.test/a.webp", "https://example.test/b.webp"],
  photo_count: 2,
  source_url: "https://www.fincaraiz.com.co/apartamento/1",
  can_schedule_viewing: false,
  schedule_viewing_url: null,
  host_name: "Advertiser",
  availability: "Availability unconfirmed",
  tags: ["external-source"],
  latitude: 6.24,
  longitude: -75.58,
  price_monthly: 2_400_000,
};

describe("toDetailRental (SAN-1504)", () => {
  it("keeps every server-grounded field the details panel shows, unchanged", () => {
    const rental = toDetailRental(row);
    expect(rental).toMatchObject({
      price_monthly: 2_400_000,
      currency: "COP",
      images: row.images,
      source_url: row.source_url,
      latitude: 6.24,
      longitude: -75.58,
      can_schedule_viewing: false,
      tags: ["external-source"],
    });
  });

  it("accepts a row with no coordinates and no gallery (unknown stays unknown)", () => {
    const bare: Record<string, unknown> = { ...row };
    for (const key of ["latitude", "longitude", "images", "photo_count"]) delete bare[key];
    const rental = toDetailRental(bare);
    expect(rental).not.toBeNull();
    expect(rental?.latitude).toBeUndefined();
    expect(rental?.images).toBeUndefined();
  });

  it("refuses a row that is missing a required field, instead of inventing one", () => {
    const noSource: Record<string, unknown> = { ...row };
    delete noSource.source_url;
    expect(toDetailRental(noSource)).toBeNull();
    expect(toDetailRental({ ...row, amenities: "wifi" })).toBeNull();
    expect(toDetailRental({ ...row, can_schedule_viewing: "yes" })).toBeNull();
  });

  it("refuses a row whose optional field has the wrong type", () => {
    expect(toDetailRental({ ...row, latitude: "6.24" })).toBeNull();
    expect(toDetailRental({ ...row, images: [1, 2] })).toBeNull();
  });

  it("refuses non-objects", () => {
    expect(toDetailRental(null)).toBeNull();
    expect(toDetailRental("row")).toBeNull();
    expect(toDetailRental(undefined)).toBeNull();
  });
});
