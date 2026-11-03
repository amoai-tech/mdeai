import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { RentalCard } from "../rental-card";

const CHAT_RESULTS_PATH = resolve(
  __dirname,
  "../search-tool-result-cards.tsx",
);

/**
 * SAN-1235 — the production chat answer showed two identical "Calle 10 #42-15, Laureles" cards
 * (two database rows for one flat). `/rentals` already labelled the second one; chat did not.
 */
describe("SAN-1235 chat duplicate listing note", () => {
  const card = (duplicateNote?: string) => (
    <RentalCard
      id="rental-2"
      listingId="apt-2"
      title="Calle 10 #42-15, Laureles"
      neighborhood="Laureles"
      nightly_price={80_000}
      price_monthly={2_400_000}
      currency="COP"
      bedrooms={2}
      duplicateNote={duplicateNote}
    />
  );

  it("renders the note on the later copy", () => {
    const html = renderToStaticMarkup(card("Also listed as #1"));
    expect(html).toContain('data-testid="rental-card-duplicate-rental-2"');
    expect(html).toContain("Also listed as #1");
  });

  it("renders no note when the listing is unique", () => {
    const html = renderToStaticMarkup(card());
    expect(html).not.toContain("rental-card-duplicate-");
  });

  it("keeps the chat renderer wired to the shared duplicate rule", () => {
    const src = readFileSync(CHAT_RESULTS_PATH, "utf8");
    expect(src).toContain('from "@/lib/rentals/duplicate-listings"');
    expect(src).toContain("duplicateListingNotes(rows)");
    expect(src).toContain("duplicateNote={duplicateNotes.get(r.id)}");
  });
});
