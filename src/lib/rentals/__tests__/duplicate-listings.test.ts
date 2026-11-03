import { describe, expect, it } from "vitest";
import type { Rental } from "@/mastra/tools/search-rentals";
import { duplicateListingNotes } from "@/lib/rentals/duplicate-listings";

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
