import { describe, expect, it } from "vitest";
import { shouldSearchEventsForCards } from "../event-intent";

const DESCRIPTION =
  "Active MDE discovery page, filters, and explicitly selected visible public item.";

// skipcq: JS-0067 - module-local test helper; not browser global scope
function context(route: string) {
  return {
    get: (key: string) =>
      key === "ag-ui"
        ? {
            context: [
              {
                description: DESCRIPTION,
                value: JSON.stringify({ route, selectedPublicEntityId: null, previousPublicEntityId: null }),
              },
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
