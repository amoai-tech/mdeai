import { describe, expect, it } from "vitest";
import {
  buildEventSearchParams,
  eventCardsToToolEnvelope,
  canFastPathEventSearch,
  isEventCardRenderRequest,
  resolveExplicitEventRequest,
  visibleEventSearchReasons,
  shouldInstantEventClarify,
} from "@/lib/event-search-fast-path";
import type { ConciergeWorkingMemory } from "@/lib/types";

describe("event-search customer-facing reasons", () => {
  it("converts supported factors into readable facts and hides internal ranking data", () => {
    expect(visibleEventSearchReasons([
      { factor: "hybrid_semantic", note: "hybrid_search_events RPC" },
      { factor: "date_window", note: "this_weekend" },
      { factor: "salsa_intent", note: "music_energy + nightlife signals" },
    ])).toEqual(["Date: this weekend", "Salsa and music relevance"]);
  });
  it("does not echo unknown/internal factors or untrusted date notes", () => {
    expect(visibleEventSearchReasons([
      { factor: "date_window_relaxed", note: "no tonight matches" },
      { factor: "date_window", note: "untrusted backend note" },
    ])).toEqual([]);
  });
});

describe("event card render routing", () => {
  it("does not treat a card-render request as a new event search", () => {
    expect(isEventCardRenderRequest("Show the first event as a card.")).toBe(true);
    expect(isEventCardRenderRequest("Show the first one as a card.")).toBe(true);
    expect(isEventCardRenderRequest("Use render_ui with the first event.")).toBe(true);
    expect(isEventCardRenderRequest("Show me cultural events in Medellín.")).toBe(false);
    expect(isEventCardRenderRequest("Show me event cards in Medellín.")).toBe(false);
  });
});

describe("event-search-fast-path", () => {
  it("searches citywide events without a category, clarifying only a bare event prompt", () => {
    for (const query of ["events in Medellín", "list events medellin", "show me events in Medellín"]) {
      expect(shouldInstantEventClarify(query, {})).toBe(false);
      expect(canFastPathEventSearch(query, {})).toBe(true);
      expect(buildEventSearchParams(query, {})).toEqual({ dateWindow: "any", limit: 10 });
    }
    expect(shouldInstantEventClarify("events?", {})).toBe(true);
    expect(shouldInstantEventClarify("events?", { lastEventQuery: { genericAskPending: true } })).toBe(false);
    expect(canFastPathEventSearch("events?", {})).toBe(false);
  });

  it("fast path for category-specific query", () => {
    expect(canFastPathEventSearch("music events in Medellín", {})).toBe(true);
    const params = buildEventSearchParams("music events in Medellín", {});
    expect(params?.category).toBe("music");
  });

  it("fast path after clarify when user names category", () => {
    const memory: ConciergeWorkingMemory = {
      lastEventQuery: { genericAskPending: true },
    };
    expect(canFastPathEventSearch("music", memory)).toBe(true);
    expect(buildEventSearchParams("music", memory)?.category).toBe("music");
  });

  it("category-only clarify answer clears stale dateWindow", () => {
    const memory: ConciergeWorkingMemory = {
      lastEventQuery: {
        genericAskPending: true,
        dateWindow: "this_weekend",
      },
    };
    const params = buildEventSearchParams("music", memory);
    expect(params).toEqual({
      category: "music",
      dateWindow: "any",
      limit: 10,
    });
  });

  it("category-only clarify answer clears stale neighborhood", () => {
    const memory: ConciergeWorkingMemory = {
      lastEventQuery: {
        genericAskPending: true,
        neighborhood: "El Poblado",
        dateWindow: "tonight",
      },
    };
    const params = buildEventSearchParams("music", memory);
    expect(params).toEqual({
      category: "music",
      dateWindow: "any",
      limit: 10,
    });
  });

  it('explicit "music this weekend" keeps this_weekend after clarify', () => {
    const memory: ConciergeWorkingMemory = {
      lastEventQuery: { genericAskPending: true, dateWindow: "tonight" },
    };
    const params = buildEventSearchParams("music this weekend", memory);
    expect(params?.category).toBe("music");
    expect(params?.dateWindow).toBe("this_weekend");
    expect(params?.neighborhood).toBeUndefined();
  });

  it('explicit "music in Poblado" keeps neighborhood after clarify', () => {
    const memory: ConciergeWorkingMemory = {
      lastEventQuery: {
        genericAskPending: true,
        dateWindow: "this_weekend",
      },
    };
    const params = buildEventSearchParams("music in Poblado", memory);
    expect(params?.category).toBe("music");
    expect(params?.neighborhood).toBe("El Poblado");
    expect(params?.dateWindow).toBe("this_weekend");
  });

  it("a citywide browse never inherits stale category, neighborhood or date filters", () => {
    const memory: ConciergeWorkingMemory = {
      lastEventQuery: { category: "music", neighborhood: "El Poblado", dateWindow: "tonight" },
    };
    expect(buildEventSearchParams("events in Medellín", memory)).toEqual({ dateWindow: "any", limit: 10 });
  });

  it("does not fast path rental queries with neighborhood names", () => {
    expect(
      canFastPathEventSearch("1BR in Laureles under $80/night", {}),
    ).toBe(false);
    expect(buildEventSearchParams("1BR in Laureles under $80/night", {})).toBe(
      null,
    );
  });

  it("does not fast path restaurant/café venue queries", () => {
    expect(canFastPathEventSearch("best cafes in Poblado", {})).toBe(false);
    expect(canFastPathEventSearch("restaurants in Poblado", {})).toBe(false);
    expect(buildEventSearchParams("best cafes in Poblado", {})).toBe(null);
  });

  it("does not fast path rental when stale event memory exists", () => {
    const memory: ConciergeWorkingMemory = {
      lastEventQuery: { category: "music", dateWindow: "any" },
    };
    expect(
      canFastPathEventSearch("1BR in Laureles under $80/night", memory),
    ).toBe(false);
  });

  it("still fast paths genuine event queries with neighborhoods", () => {
    expect(canFastPathEventSearch("music in Poblado", {})).toBe(true);
    expect(canFastPathEventSearch("nightlife this weekend in Poblado", {})).toBe(
      true,
    );
    expect(buildEventSearchParams("salsa events in Laureles", {})?.category).toBe(
      "music",
    );
  });

  describe("UX-019 Option B memory guard (UX-T-019)", () => {
    const afterSalsaMemory: ConciergeWorkingMemory = {
      lastEventQuery: { category: "music", dateWindow: "any" },
    };

    it("Option A regression: dinner after event memory does not fast-path", () => {
      expect(
        buildEventSearchParams("quiet rooftop dinner in Provenza", afterSalsaMemory),
      ).toBeNull();
      expect(
        canFastPathEventSearch("quiet rooftop dinner in Provenza", afterSalsaMemory),
      ).toBe(false);
    });

    it("L55: Provenza tonight does not inherit stale category from prior salsa search", () => {
      const params = buildEventSearchParams("Provenza tonight", afterSalsaMemory);
      expect(params?.category).toBeUndefined();
      expect(params?.dateWindow).toBe("tonight");
    });

    it("L81: bare follow-up does not replay last event query", () => {
      expect(buildEventSearchParams("ok", afterSalsaMemory)).toBeNull();
      expect(canFastPathEventSearch("and there?", afterSalsaMemory)).toBe(false);
    });
  });

  describe("SEARCH-002 queryText gate (high-intent only)", () => {
    it("attaches queryText for salsa this weekend", () => {
      expect(buildEventSearchParams("salsa this weekend", {})?.queryText).toBe(
        "salsa this weekend",
      );
    });

    it("attaches queryText for nightlife this weekend in Poblado", () => {
      expect(
        buildEventSearchParams("nightlife this weekend in Poblado", {})?.queryText,
      ).toBe("nightlife this weekend in Poblado");
    });

    it("attaches queryText for fashion and networking intents", () => {
      expect(
        buildEventSearchParams("fashion events tonight", {})?.queryText,
      ).toBe("fashion events tonight");
      expect(
        buildEventSearchParams("networking events this weekend", {})?.queryText,
      ).toBe("networking events this weekend");
    });

    it("omits queryText for broad category browse (music events)", () => {
      const params = buildEventSearchParams("music events in Medellín", {});
      expect(params?.category).toBe("music");
      expect(params?.queryText).toBeUndefined();
    });

    it("omits queryText for show-all browse", () => {
      expect(
        buildEventSearchParams("show all events in Medellín", {})?.queryText,
      ).toBeUndefined();
    });
  });
});

describe("SAN-1250 honest ticket offer transport", () => {
  it("preserves real prices, currency, ticket URL and Buy availability in the fast path envelope", () => {
    const envelope = eventCardsToToolEnvelope([
      { id: "tierless", title: "Parade", category: "culture",
        venue: "Medellín", neighborhood: "Poblado",
        startsAt: "2027-02-24T01:00:00Z",
        pricePerTicket: null, currency: "USD", imageUrl: "",
        canBuyTickets: false, ticketUrl: "/events/parade" },
      { id: "paid", title: "Reina", category: "culture",
        venue: "Medellín", neighborhood: "Poblado",
        startsAt: "2027-02-24T01:00:00Z",
        pricePerTicket: 40000, currency: "COP", imageUrl: "",
        canBuyTickets: true, ticketUrl: "/events/reina" },
    ]);
    expect(envelope.results[0]).toMatchObject({
      pricePerTicket: null, canBuyTickets: false, ticketUrl: "/events/parade",
    });
    expect(envelope.results[1]).toMatchObject({
      pricePerTicket: 40000, currency: "COP",
      canBuyTickets: true, ticketUrl: "/events/reina",
    });
  });
});

describe("resolveExplicitEventRequest", () => {
  const rows = [
    { id: "first-id", title: "Feria de las Flores" },
    { id: "second-id", title: "Reina de Antioquia" },
  ];
  it("resolves first, second and named events without the model", () => {
    expect(resolveExplicitEventRequest("Show the first event as a card.", rows)).toBe("first-id");
    expect(resolveExplicitEventRequest("Show the second event as a card.", rows)).toBe("second-id");
    expect(resolveExplicitEventRequest("Show Reina de Antioquia as a card.", rows)).toBe("second-id");
  });
  it("does not guess an ambiguous request", () => {
    expect(resolveExplicitEventRequest("Show an event as a card.", rows)).toBeNull();
    expect(resolveExplicitEventRequest("Show the second event as a card.", [rows[0]])).toBeNull();
  });
});

describe("resolveExplicitEventRequest · identity before position", () => {
  it("treats a named event as a title, not as an ordinal", () => {
    const rows = [
      { id: "jazz", title: "Sunday Jazz" },
      { id: "salsa", title: "Second Sunday Salsa" },
    ];
    // "Second" is part of the NAME here; the old order returned rows[1] by accident and
    // would return the wrong event whenever the ordinal did not line up.
    expect(resolveExplicitEventRequest("Show Sunday Jazz as a card.", rows)).toBe("jazz");
    expect(resolveExplicitEventRequest("Show Second Sunday Salsa as a card.", rows)).toBe("salsa");
  });

  it("prefers the longest matching title", () => {
    const rows = [
      { id: "short", title: "Jazz Night" },
      { id: "long", title: "Jazz Night Medellin" },
    ];
    expect(resolveExplicitEventRequest("Open Jazz Night Medellin please", rows)).toBe("long");
    expect(resolveExplicitEventRequest("Open Jazz Night please", rows)).toBe("short");
  });

  it("does not guess when two different rows match equally", () => {
    const rows = [
      { id: "a", title: "Jazz Night" },
      { id: "b", title: "Jazz Night" },
    ];
    expect(resolveExplicitEventRequest("Show Jazz Night as a card", rows)).toBeNull();
  });

  it("still resolves a pure ordinal request", () => {
    const rows = [
      { id: "one", title: "Alpha" },
      { id: "two", title: "Beta" },
    ];
    expect(resolveExplicitEventRequest("Show the second event as a card", rows)).toBe("two");
  });
});
