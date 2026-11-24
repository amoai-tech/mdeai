import { describe, expect, it } from "vitest";
import type { Rental } from "@/mastra/tools/search-rentals";
import { APARTMENT_DUPLICATE_FIELDS, deduplicateApartmentRows, duplicateListingNotes } from "@/lib/rentals/duplicate-listings";

const row = (id: string, overrides: Partial<Rental> = {}): Rental =>
  ({
    id,
    title: "Calle 10 #42-15, Laureles",
    neighborhood: "Laureles",
    bedrooms: 2,
    nightly_price: 80_000,
    price_monthly: 2_400_000,
    currency: "COP",
    ...overrides,
  }) as Rental;

describe("duplicateListingNotes", () => {
  it("labels the later copy and leaves the first unlabelled", () => {
    const notes = duplicateListingNotes([row("a"), row("b")]);
    expect(notes.has("a")).toBe(false);
    expect(notes.get("b")).toBe("Also listed as #1");
  });

  it("does not label a different price, size or neighbourhood", () => {
    const notes = duplicateListingNotes([
      row("a"),
      row("b", { price_monthly: 2_500_000 }),
      row("c", { bedrooms: 3 }),
      row("d", { neighborhood: "El Poblado" }),
    ]);
    expect(notes.size).toBe(0);
  });

  it("handles more than two copies", () => {
    const notes = duplicateListingNotes([row("a"), row("b"), row("c")]);
    expect(notes.get("b")).toBe("Also listed as #1");
    expect(notes.get("c")).toBe("Also listed as #1");
  });

  // SAN-1235 — chat decodes a looser tool envelope than the browse projection: currency and the
  // nightly price are optional there. A missing field must not throw, and two rows that carry the
  // same values must still be labelled.
  it("labels duplicates in chat envelope rows that omit currency and nightly price", () => {
    const chatRow = (id: string) => ({
      id,
      title: "Calle 10 #42-15, Laureles",
      neighborhood: "Laureles",
      bedrooms: 2,
      price_monthly: 2_400_000,
    });
    const notes = duplicateListingNotes([chatRow("a"), chatRow("b")]);
    expect(notes.has("a")).toBe(false);
    expect(notes.get("b")).toBe("Also listed as #1");
  });

  it("treats a missing nightly price as its own key instead of matching a priced twin", () => {
    const notes = duplicateListingNotes([
      row("a"),
      { ...row("b"), nightly_price: undefined },
    ]);
    expect(notes.size).toBe(0);
  });
});

const rawRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  ...Object.fromEntries(APARTMENT_DUPLICATE_FIELDS.map((field) => [field, null])),
  id, title: "Calle 10 #42-15, Laureles", address: "Calle 10 #42-15", neighborhood: "Laureles",
  landlord_id: "owner-a", bedrooms: 2, bathrooms: 1, furnished: true,
  price_monthly: 2_400_000, currency: "COP", ...overrides,
});

describe("deduplicateApartmentRows", () => {
  it("keeps the first copy and the next distinct listing", () => {
    const first = rawRow("a");
    const different = rawRow("c", { address: "Calle 12 #30-20" });
    expect(deduplicateApartmentRows([first, rawRow("b"), different])).toEqual([first, different]);
  });
  it.each([{ landlord_id: "owner-b" }, { floor_number: 5 }, { source_listing_id: "another-unit" },
    { slug: "another-unit" }, { images: ["https://example.com/other.jpg"] }, { price_monthly: 2_500_000 },
    { bathrooms: 2 }, { description: "Different apartment number" }])("preserves distinct evidence: %j", (difference) => {
    expect(deduplicateApartmentRows([rawRow("a"), rawRow("b", difference)])).toHaveLength(2);
  });
  it("does not infer equality from missing addresses, owners or partial projections", () => {
    expect(deduplicateApartmentRows([rawRow("a", { address: null }), rawRow("b", { address: null })])).toHaveLength(2);
    expect(deduplicateApartmentRows([rawRow("a", { landlord_id: null }), rawRow("b", { landlord_id: null })])).toHaveLength(2);
    expect(deduplicateApartmentRows([{ id: "a" }, { id: "b" }])).toHaveLength(2);
  });
});
