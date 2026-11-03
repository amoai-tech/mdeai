import { unsupportedRestaurantFields } from "@/lib/restaurants/restaurant-owner-schema";
import { describe, expect, it } from "vitest";

import {
  buildRestaurantListingPatch,
  listingValuesFromRecord,
  parseListInput,
  restaurantListingPatchSchema,
} from "@/lib/restaurants/restaurant-owner-schema";

const BASE = listingValuesFromRecord({
  name: "Cafe Norte",
  description: "Original",
  website: "https://norte.example",
  phone: "+57 300 000 0000",
  email: "hola@norte.example",
  address: "Calle 10 #40-20",
  neighborhood: "Poblado",
  city: "Medellín",
  postal_code: "050021",
  hours_of_operation: { monday: { open: "09:00", close: "18:00" } },
  price_level: 2,
  cuisine_types: ["Colombian"],
  dietary_options: null,
  ambiance: null,
  tags: [],
  images: [],
  primary_image_url: null,
});

describe("listingValuesFromRecord", () => {
  it("keeps unknown values unknown instead of inventing them", () => {
    expect(BASE.dietary_options).toEqual([]);
    expect(BASE.images).toEqual([]);
    expect(BASE.primary_image_url).toBe("");
    expect(BASE.price_level).toBe(2);
  });

  it("drops malformed stored hours and images rather than showing them", () => {
    const values = listingValuesFromRecord({
      name: "Cafe",
      hours_of_operation: { monday: { open: "noon" } },
      images: [{ url: "not-a-url" }],
      price_level: 9,
    });
    expect(values.hours_of_operation).toEqual({});
    expect(values.images).toEqual([]);
    expect(values.price_level).toBeNull();
  });
});

describe("buildRestaurantListingPatch", () => {
  it("sends only edited fields", () => {
    expect(
      buildRestaurantListingPatch({ ...BASE, description: "New text" }, BASE),
    ).toEqual({ description: "New text" });
  });

  it("sends nothing when the form did not change", () => {
    expect(buildRestaurantListingPatch(BASE, BASE)).toEqual({});
  });

  it("compares arrays by value, not identity", () => {
    expect(
      buildRestaurantListingPatch(
        { ...BASE, cuisine_types: ["Colombian"] },
        { ...BASE, cuisine_types: ["Colombian"] },
      ),
    ).toEqual({});
  });

  it("allows clearing a value the operator explicitly emptied", () => {
    expect(
      buildRestaurantListingPatch({ ...BASE, website: "" }, BASE),
    ).toEqual({ website: "" });
  });

  it("maps a fully cleared hours editor to null", () => {
    expect(
      buildRestaurantListingPatch(
        { ...BASE, hours_of_operation: {} },
        BASE,
      ),
    ).toEqual({ hours_of_operation: null });
  });
});

describe("restaurantListingPatchSchema", () => {
  it("accepts supported listing fields", () => {
    const parsed = restaurantListingPatchSchema.safeParse({
      description: "Updated",
      price_level: 3,
      hours_of_operation: { monday: { open: "09:00", close: "18:00" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects assignment and administrative fields", () => {
    for (const field of ["partner_id", "is_active", "is_verified", "google_place_id", "rating", "source"]) {
      expect(
        restaurantListingPatchSchema.safeParse({ [field]: "x" }).success,
        field,
      ).toBe(false);
    }
  });

  it("rejects an empty patch and invalid values", () => {
    expect(restaurantListingPatchSchema.safeParse({}).success).toBe(false);
    expect(restaurantListingPatchSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(
      restaurantListingPatchSchema.safeParse({ website: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      restaurantListingPatchSchema.safeParse({
        hours_of_operation: { monday: { open: "25:00", close: "18:00" } },
      }).success,
    ).toBe(false);
    expect(
      restaurantListingPatchSchema.safeParse({ images: [{ url: "file:///etc/passwd" }] }).success,
    ).toBe(false);
  });
});

describe("parseListInput", () => {
  it("trims, removes blanks and de-duplicates", () => {
    expect(parseListInput(" Colombian, , Italian ,Colombian ")).toEqual([
      "Colombian",
      "Italian",
    ]);
  });
});

describe("unsupported legacy listing data", () => {
  it("detects unknown stored hours and photos before edits", () => {
    expect(unsupportedRestaurantFields({
      hours_of_operation: { legacy: "open today" },
      images: [{ legacyUrl: "https://example.com/photo.jpg" }],
    })).toEqual({ hours: true, images: true });
    expect(unsupportedRestaurantFields({
      hours_of_operation: { monday: { open: "09:00", close: "18:00" } },
      images: [{ url: "https://example.com/photo.jpg" }],
    })).toEqual({ hours: false, images: false });
  });
});
