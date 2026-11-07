// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { hasRenderedEventCard } from "../use-concierge-send-handlers";

/**
 * The model-path fallback must not add a Quick view when the model already answered with
 * a card. Before this guard, an AI card for event #3 was followed by a Quick view for the
 * first event, because the fallback only knew `activeEventId`.
 */
describe("hasRenderedEventCard", () => {
  it("is false when no A2UI event card is on screen", () => {
    expect(hasRenderedEventCard()).toBe(false);
  });

  it("is true for ANY rendered event card, not only the requested one", () => {
    const card = document.createElement("div");
    card.dataset.testid = "a2ui-event-card";
    card.dataset.eventId = "event-3";
    document.body.appendChild(card);
    expect(hasRenderedEventCard()).toBe(true);
    card.remove();
    expect(hasRenderedEventCard()).toBe(false);
  });
});
