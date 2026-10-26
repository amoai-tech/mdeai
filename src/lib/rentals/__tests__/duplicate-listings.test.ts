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
});
