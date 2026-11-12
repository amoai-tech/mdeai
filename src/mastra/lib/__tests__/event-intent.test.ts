import { describe, expect, it } from "vitest";
import { shouldSearchEventsForCards } from "../event-intent";
import { EVENT_A2UI_CONTEXT_DESCRIPTION } from "@/lib/events/a2ui-context";

const DESCRIPTION =
  "Active MDE discovery page, filters, and explicitly selected visible public item.";

// skipcq: JS-0067 - module-local test helper; not browser global scope
function context(route: string, ids: string[] = []) {
  return {
    get: (key: string) =>
      key === "ag-ui"
        ? {
            context: [
              {
                description: DESCRIPTION,
                value: JSON.stringify({ route, selectedPublicEntityId: null, previousPublicEntityId: null }),
              },
              ...(ids.length ? [{ description: EVENT_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(ids) }] : []),
            ],
          }
        : undefined,
  };
}

const user = (text: string) => ({ role: "user", content: text });

describe("shouldSearchEventsForCards", () => {
  it("pins the event search when the Events page asks for cards", () => {
    for (const text of [
      "Show upcoming events as cards.",
      "show me events cards",
      "display these events as a card",
    ]) {
      expect(
        shouldSearchEventsForCards({
          stepNumber: 0,
          messages: [user(text)],
          requestContext: context("/events"),
        }),
      ).toBe(true);
    }
  });

  it("does not force a new search for ordinal or current-result card requests", () => {
    const ids = [
      "22222222-2222-2222-2222-000000000001",
      "a1b2c3d4-0001-0001-0001-000000000003",
    ];
    for (const text of [
      "Show the second event from these results as a card",
      "Show the first event as a card in the current results",
      "Display these events as cards",
      "Show the last event as a card on this page",
    ]) {
      expect(shouldSearchEventsForCards({
        stepNumber: 0, messages: [user(text)], requestContext: context("/events", ids),
      }), text).toBe(false);
    }
  });

  it("still searches when a new event filter is requested, even with old IDs", () => {
    const ids = ["22222222-2222-2222-2222-000000000001"];
    for (const text of [
      "Show salsa events this weekend as cards",
      "Show the second event in Laureles as a card",
      "Show free events next month as cards",
    ]) {
      expect(shouldSearchEventsForCards({
        stepNumber: 0, messages: [user(text)], requestContext: context("/events", ids),
      }), text).toBe(true);
    }
  });

  it("does not route payment questions or native Details actions into event search", () => {
    for (const text of [
      "Can I see if they accept card payments?",
      "Show the details card for this event",
      "Open the first event details card",
      "Show me rental cards",
      "Show Reina de Antioquia as a card",
    ]) {
      expect(shouldSearchEventsForCards({
        stepNumber: 0, messages: [user(text)], requestContext: context("/events"),
      }), text).toBe(false);
    }
  });

  it("does not fire off the Events page, on a later step, or for a details request", () => {
    expect(
      shouldSearchEventsForCards({
        stepNumber: 0,
        messages: [user("show events as cards")],
        requestContext: context("/rentals"),
      }),
    ).toBe(false);
    expect(
      shouldSearchEventsForCards({
        stepNumber: 1,
        messages: [user("show events as cards")],
        requestContext: context("/events"),
      }),
    ).toBe(false);
    expect(
      shouldSearchEventsForCards({
        stepNumber: 0,
        messages: [user("show me the details for the first event")],
        requestContext: context("/events"),
      }),
    ).toBe(false);
    expect(
      shouldSearchEventsForCards({
        stepNumber: 0,
        messages: [user("show events as cards")],
        requestContext: { get: () => undefined },
      }),
    ).toBe(false);
  });
});
