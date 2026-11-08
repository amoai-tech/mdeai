import { describe, expect, it } from "vitest";
import { buildRentalPageControlUrl, parseRentalPageCommand, rentalPageControlSchema, resolveRentalPageControl } from "@/lib/rentals/browse-page-control";
import { buildEventPageControlUrl, eventPageControlSchema } from "@/lib/events/browse-page-control";

const rental = { neighborhood: "Laureles", beds: "2", from: null, through: null };

describe("page filter control", () => {
  it("merges only the requested native rental filters and preserves the rest", () => {
    expect(buildRentalPageControlUrl(rental, { beds: "1" })).toBe(
      "/rentals?neighborhood=Laureles&beds=1",
    );
    expect(buildRentalPageControlUrl(rental, { neighborhood: null })).toBe("/rentals?beds=2");
  });

  it("parses explicit page commands and leaves unsupported criteria to search", () => {
    expect(parseRentalPageCommand("On this page, show only 1-bedroom apartments in Laureles.")).toEqual({
      neighborhood: "Laureles",
      beds: "1",
    });
    expect(parseRentalPageCommand("Find furnished 2-bedroom apartments in Laureles under COP 3M.")).toBeNull();
    expect(parseRentalPageCommand("On this page, show furnished apartments.")).toBeNull();
    expect(parseRentalPageCommand("On this page, show 2-bedroom apartments in Laureles for COP 3M max.")).toBeNull();
    expect(parseRentalPageCommand("On this page, show 2-bedroom apartments in Laureles with wifi.")).toBeNull();
    expect(parseRentalPageCommand("On this page, show 4-bedroom apartments in Laureles.")).toBeNull();
    expect(parseRentalPageCommand("On this page, remove the Laureles filter.")).toBeNull();
    expect(parseRentalPageCommand("On this page, don't show 1-bedroom apartments.")).toBeNull();
  });

  it("only fast-paths complete affirmative native page commands", () => {
    expect(parseRentalPageCommand("Change the page to 2 bedrooms in Envigado.")).toEqual({
      neighborhood: "Envigado", beds: "2",
    });
    // Negation/removal must not accidentally ADD the named filter.
    for (const message of [
      "On this page, remove the Laureles filter.",
      "On this page, don't show 1-bedroom apartments in Laureles.",
      "On this page, show apartments without 1 bedroom in Laureles.",
      "On this page, show all bedrooms in Laureles.",
      "On this page, show apartments in any neighborhood.",
      "On this page, exclude 2-bedroom apartments in Envigado.",
      "On this page, show 1-bedroom rentals in Laureles, not Envigado.",
    ]) expect(parseRentalPageCommand(message), message).toBeNull();
  });

  it("keeps all semantic or location requirements on the search path", () => {
    for (const message of [
      "On this page, show quiet 1-bedroom apartments in Laureles near cafés.",
      "On this page, show 2-bedroom apartments in Laureles for remote work.",
      "On this page, show 1-bedroom apartments in Laureles near the metro.",
      "On this page, show family rentals with 2 bedrooms in Envigado.",
      "On this page, show 2-bedroom apartments in Laureles with a terrace.",
      "On this page, show 1-bedroom apartments in Laureles overlooking the park.",
      "On this page, show 1-bedroom apartments in Laureles for a digital nomad.",
      "On this page, show the top 5 apartments with 1 bedroom in Laureles.",
    ]) expect(parseRentalPageCommand(message), message).toBeNull();
  });

  it("rejects a date order that is reversed only after merging current filters", () => {
    const result = resolveRentalPageControl(
      { neighborhood: "Laureles", beds: "2", from: "2026-11-10", through: null },
      { through: "2026-11-01" },
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining("reversed") });
  });

  it("keeps canonical 'any date' and no-price URLs canonical", () => {
    expect(buildEventPageControlUrl({ dateWindow: "any", price: null }, {})).toBe("/events");
  });

  it("rejects unsupported rental filter keys and invalid bed values", () => {
    expect(rentalPageControlSchema.safeParse({ furnished: true }).success).toBe(false);
    expect(rentalPageControlSchema.safeParse({ beds: "4" }).success).toBe(false);
  });

  it("builds the existing event filter URL and clears with null", () => {
    const current = { category: "music" as const, neighborhood: "Laureles", dateWindow: "this_weekend" as const, price: null };
    expect(buildEventPageControlUrl(current, { category: "nightlife" })).toBe(
      "/events?category=nightlife&neighborhood=Laureles&dateWindow=this_weekend",
    );
    expect(buildEventPageControlUrl(current, { dateWindow: "any", price: "paid" })).toBe(
      "/events?category=music&neighborhood=Laureles&price=paid",
    );
    expect(eventPageControlSchema.safeParse({ category: "salsa" }).success).toBe(false);
  });
});
