import { describe, expect, it } from "vitest";
import { parseEventFacts } from "../parse-event-facts";

describe("parseEventFacts", () => {
  it("returns null for empty, array or non-object details so the Feria stays sparse", () => {
    expect(parseEventFacts({})).toBeNull();
    expect(parseEventFacts(null)).toBeNull();
    expect(parseEventFacts([])).toBeNull();
    expect(parseEventFacts({ artist: "  ", highlights: [1, ""] })).toBeNull();
  });

  it("maps only stored keys and trims them", () => {
    expect(parseEventFacts({ artist: " Blessd ", genre: "Reggaeton", ticket_source: "Concerts50", highlights: ["A", 3, " B "] }))
      .toEqual({ artist: "Blessd", genre: "Reggaeton", ticketInfo: null, listingSource: "Concerts50", highlights: ["A", "B"] });
  });
});
