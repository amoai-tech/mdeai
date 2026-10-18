/**
 * The agent chat path used to drop "pet friendly" silently: the search cannot filter it, and
 * only the fast path disclosed it. The tool now reports the requests it could not apply, read
 * from the renter's own words, and the cards render the same sentence the fast path uses.
 */
import { describe, expect, it } from "vitest";
import { unappliedRequestsFor } from "../search-rentals";

describe("unappliedRequestsFor", () => {
  it("reports pets and furnishing from the renter's own words", () => {
    expect(unappliedRequestsFor({ queryText: "pet friendly 2 bedroom in Laureles" })).toEqual([
      "pet-friendly",
    ]);
    expect(unappliedRequestsFor({ queryText: "furnished with parking" })).toEqual([
      "furnished",
      "parking",
    ]);
  });

  it("stays silent for a request the search can apply", () => {
    expect(unappliedRequestsFor({ queryText: "2 bedroom in Laureles under 80" })).toEqual([]);
    expect(unappliedRequestsFor({})).toEqual([]);
  });

  it("does not invent a request from an empty or look-alike query", () => {
    expect(unappliedRequestsFor({ queryText: "   " })).toEqual([]);
    expect(unappliedRequestsFor({ queryText: "a carpet and a catalog" })).toEqual([]);
  });
});
