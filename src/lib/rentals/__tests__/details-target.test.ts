import { describe, expect, it } from "vitest";
import type { Rental } from "@/mastra/tools/search-rentals";
import { resolveRentalForDetails } from "@/lib/rentals/details-target";

const rental = (id: string) => ({ id, title: `Apartment ${id}` }) as Rental;
const rows = [rental("a"), rental("b"), rental("c")];

describe("resolveRentalForDetails", () => {
  it("defaults to the first apartment", () => {
    expect(resolveRentalForDetails(rows)?.id).toBe("a");
  });

  it("reads the 1-based position the agent was told to use", () => {
    expect(resolveRentalForDetails(rows, { index: 2 })?.id).toBe("b");
    expect(resolveRentalForDetails(rows, { index: 3 })?.id).toBe("c");
  });

  it("refuses an out-of-range position instead of opening a different apartment", () => {
    expect(resolveRentalForDetails(rows, { index: 99 })).toBeNull();
    expect(resolveRentalForDetails(rows, { index: 0 })).toBeNull();
  });

  it("opens an explicit listing id, including the pin-prefixed form", () => {
    expect(resolveRentalForDetails(rows, { listingId: "b" })?.id).toBe("b");
    expect(resolveRentalForDetails(rows, { listingId: "rental-c" })?.id).toBe("c");
  });

  it("refuses an id that is not in the current results", () => {
    expect(resolveRentalForDetails(rows, { listingId: "not-shown" })).toBeNull();
  });

  it("opens nothing when the page has no results", () => {
    expect(resolveRentalForDetails([], { index: 1 })).toBeNull();
  });
});
