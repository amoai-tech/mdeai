import { describe, expect, it } from "vitest";
import { shouldRenderRentalFilterControl, shouldRequestRecommendations } from "../recommendation-intent";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";

const page = (route: string) => ({
  get: (key: string) =>
    key === "ag-ui"
      ? { context: [
          { description: RENTAL_A2UI_CONTEXT_DESCRIPTION,
            value: JSON.stringify(["37a05b09-f560-4776-92fd-b8bb2b92e611"]) },
          { description: "Active MDE discovery page, filters, and explicitly selected visible public item.",
            value: JSON.stringify({ route, selectedPublicEntityId: null }) },
        ] }
      : undefined,
});
const hints = page("/rentals");
const noHints = { get: () => ({ context: [] }) };
const ask = (text: string) => [{ role: "user", content: text }];

describe("shouldRequestRecommendations", () => {
  it.each([
    "Show the first two as cards.",
    "Show these apartments as cards.",
    "Show the first apartment as a card.",
    "Show three apartments here.",
  ])("pins the card tool for %s", (text) => {
    expect(shouldRequestRecommendations({ stepNumber: 0, messages: ask(text), requestContext: hints })).toBe(true);
  });

  it.each([
    "show me 2 bedroom apartments in Poblado",
    "show Poblado apartments as cards",
    "show the first two in Poblado as cards",
    "show these furnished apartments as cards",
    "show apartments under COP 3000000 as cards",
  ])("does not hijack a new search: %s", (text) => {
    expect(shouldRequestRecommendations({ stepNumber: 0, messages: ask(text), requestContext: hints })).toBe(false);
  });

  it("does not send /chat requests to an unmounted Rentals surface", () => {
    expect(shouldRequestRecommendations({
      stepNumber: 0, messages: ask("show first two as cards"), requestContext: page("/chat"),
    })).toBe(false);
    expect(shouldRequestRecommendations({
      stepNumber: 0, messages: ask("show first two as cards"), requestContext: page("/events"),
    })).toBe(false);
  });

  it("does nothing without published IDs", () => {
    expect(shouldRequestRecommendations({ stepNumber: 0, messages: ask("show these as cards"), requestContext: noHints })).toBe(false);
  });

  it("never hijacks a details request or an open question", () => {
    expect(shouldRequestRecommendations({ stepNumber: 0, messages: ask("show details for the first"), requestContext: hints })).toBe(false);
    expect(shouldRequestRecommendations({ stepNumber: 0, messages: ask("which apartments fit me best?"), requestContext: hints })).toBe(false);
  });

  it("only acts on the first step", () => {
    expect(shouldRequestRecommendations({ stepNumber: 1, messages: ask("show them as cards"), requestContext: hints })).toBe(false);
  });
});

describe("SAN-1655 bedroom control intent", () => {

  it.each([
    "Let me adjust the bedrooms on this page.",
    "Give me a bedroom control.",
    "Change the bedrooms here.",
    "set beds",
    "Quiero cambiar las habitaciones.",
  ])("renders for %s", (text) => {
    expect(shouldRenderRentalFilterControl({ stepNumber: 0, messages: ask(text), requestContext: page("/rentals") })).toBe(true);
  });

  it.each([
    "Show me 2 apartments in Laureles.",
    "Show me 2 bedroom apartments here.",
    "How many bedrooms does the one here have?",
    "Search for 1 bedroom apartments.",
    "Open details for the first one.",
    "What is the price?",
    "Change the page to 1 bedroom.",
    "Muéstrame 2 apartamentos en Laureles.",
  ])("does not render for %s", (text) => {
    expect(shouldRenderRentalFilterControl({ stepNumber: 0, messages: ask(text), requestContext: page("/rentals") })).toBe(false);
  });

  it("needs the Rentals page", () => {
    expect(
      shouldRenderRentalFilterControl({
        stepNumber: 0,
        messages: ask("adjust the bedrooms"),
        requestContext: { get: () => undefined },
      }),
    ).toBe(false);
  });
});
