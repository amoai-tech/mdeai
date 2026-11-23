import { describe, expect, it } from "vitest";
import { shouldRenderRentalFilterControl, shouldRenderViewingProposal, shouldRequestRecommendations } from "../recommendation-intent";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION, RENTAL_RESULT_COUNT_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";

const page = (route: string, renderedCount?: number) => ({
  get: (key: string) =>
    key === "ag-ui"
      ? { context: [
          { description: RENTAL_A2UI_CONTEXT_DESCRIPTION,
            value: JSON.stringify(["37a05b09-f560-4776-92fd-b8bb2b92e611", "37a05b09-f560-4776-92fd-b8bb2b92e612", "37a05b09-f560-4776-92fd-b8bb2b92e613", "37a05b09-f560-4776-92fd-b8bb2b92e614", "37a05b09-f560-4776-92fd-b8bb2b92e615", "37a05b09-f560-4776-92fd-b8bb2b92e616"]) },
          ...(renderedCount === undefined ? [] : [{ description: RENTAL_RESULT_COUNT_CONTEXT_DESCRIPTION, value: JSON.stringify(renderedCount) }]),
          { description: "Active MDE discovery page, filters, and explicitly selected visible public item.",
            value: JSON.stringify({ route, selectedPublicEntityId: null }) },
        ] }
      : undefined,
});
const hints = page("/rentals", 6);
const noHints = { get: () => ({ context: [] }) };
const ask = (text: string) => [{ role: "user", content: text }];

describe("shouldRequestRecommendations", () => {
  it("treats from the current results as a reference, not as a new filter", () => {
    expect(shouldRequestRecommendations({
      stepNumber: 0,
      messages: ask("Show the second apartment as a card from the current results"),
      requestContext: hints,
    })).toBe(true);
    expect(shouldRequestRecommendations({
      stepNumber: 0,
      messages: ask("Show the first apartment as a card in the current results"),
      requestContext: hints,
    })).toBe(true);
    expect(shouldRequestRecommendations({
      stepNumber: 0,
      messages: ask("Show the second apartment with a balcony as a card from the current results"),
      requestContext: hints,
    })).toBe(false);
  });

  it.each([
    ["Show the second apartment as a card from these results", true],
    ["Show the first apartment as a card in those results", true],
    ["Show the second apartment as a card not from the current results", false],
    ["Show the second apartment as a card not from these results", false],
    ["Show other apartments as cards, not the ones in the current results", false],
    ["Show apartments as cards that aren't in the current results", false],
    ["Show apartments as cards excluding those in the current results", false],
    ["Show apartments as cards except the ones in these results", false],
    ["Show apartments as cards other than those in the current results", false],
    ["Show new apartments as cards instead of the ones in the current results", false],
    ["Show apartments as cards but none from the current results", false],
    ["Show apartments as cards that don't appear in the current results", false],
    ["Show apartments as cards that doesn't appear in the current results", false],
    ["Show apartments as cards from the current results, max $1,000", false],
    ["Show apartments as cards from these results, max $1,000", false],
    ["Show the second apartment as a card from the current results with a balcony", false],
    ["Show the second apartment as a card from the current results in Laureles", false],
  ])("keeps current-results pointers separate from real search criteria: %s", (text, expected) => {
    expect(shouldRequestRecommendations({ stepNumber: 0, messages: ask(text), requestContext: hints })).toBe(expected);
  });

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
    "Show me the bedroom control.",
    "Can you show a bedroom selector here?",
    "Can you change the bedrooms?",
    "¿Puedes cambiar las recámaras?",
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
    "Cambiar a 2 habitaciones.",
    "Buscar 3 dormitorios en Laureles.",
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

describe("shouldRenderViewingProposal (SAN-1658)", () => {
  const run = (text: string, requestContext: unknown = hints, stepNumber = 0) =>
    shouldRenderViewingProposal({ stepNumber, messages: ask(text), requestContext: requestContext as never });

  it.each([
    ["Request a viewing of the second apartment at 3:15 PM.", true],
    ["Request a viewing of the second apartment between 3 and 5 PM", true],
    ["Book a viewing of apartment 2 for me and 2 friends", true],
    ["Agendar una visita del primer apartamento a las 3 o 4", true],
    ["Schedule a viewing for the first one", true],
    ["Can you book a tour of apartment 3?", true],
    ["Agendar una visita del primer apartamento", true],
    ["Quiero agendar una visita para el primero", true],
    ["Request a viewing of the third place", true],
    ["Request a viewing of the last apartment", true],
    ["Schedule a viewing of apartment 6", true],
    ["Agendar una visita del sexto apartamento", true],
    ["Schedule a viewing of 37a05b09-f560-4776-92fd-b8bb2b92e611", true],
  ])("%s -> %s", (text, expected) => {
    expect(run(text)).toBe(expected);
  });

  it.each([
    "Schedule a viewing of the 12th apartment",
    "Book a tour of apartment 12",
    "Request a viewing for the seventh apartment",
    "Agendar una visita del séptimo apartamento",
    "Schedule a viewing of apartment 0",
  ])("does not force the tool for an out-of-range listing: %s", (text) => {
    expect(run(text)).toBe(false);
  });

  it.each([
    "Schedule a viewing of apartment 1 or apartment 2",
    "Request a tour for the first apartment or the third apartment",
    "Agendar una visita del primer apartamento o del segundo apartamento",
    "Book a viewing for apartment 2 and apartment 3",
    "Schedule a viewing for the first or second apartment",
    "Schedule a viewing for the first or the second apartment",
    "Schedule a viewing of the first one or the listing second",
    "Agendar una visita del primer apartamento o el segundo",
    "Book a viewing for apartment 1 or 2",
  ])("does not choose between multiple listing positions: %s", (text) => {
    expect(run(text)).toBe(false);
  });

  it("does not show a viewing proposal from old cards when a new search is requested", () => {
    expect(run("Find apartments in Laureles and schedule a viewing of the first apartment.")).toBe(false);
    expect(run("Search rentals under COP 3M and request a viewing of apartment 2.")).toBe(false);
    expect(run("Schedule a viewing of the second apartment.")).toBe(true);
    expect(run("Please schedule a viewing of the second apartment and find a time.")).toBe(true);
  });

  it("does not force the tool when no apartment is named (the model would have to guess an ID)", () => {
    expect(run("Can I book a tour that fits my schedule?")).toBe(false);
    expect(run("Schedule a visit here")).toBe(false);
    expect(run("Request a viewing of them")).toBe(false);
    // Calendar phrases are not listings.
    expect(run("Schedule a viewing on the 15th")).toBe(false);
    expect(run("Book a tour for the last week of November")).toBe(false);
    expect(run("Schedule a visit for the first available time")).toBe(false);
    expect(run("Do not schedule a viewing of the second apartment. Show its details instead.")).toBe(false);
    expect(run("Don\u0027t book a tour of apartment 3.")).toBe(false);
    expect(run("I do not want to schedule a viewing of the first apartment.")).toBe(false);
    expect(run("Can you book a tour of this apartment?")).toBe(false);
    expect(run("Quiero agendar una visita la primera semana de diciembre")).toBe(false);
    expect(run("Quiero agendar una visita el primer día de diciembre")).toBe(false);
  });

  it("never treats the last published hint as the last apartment when the page has more results", () => {
    expect(run("Schedule a viewing of the last apartment", page("/rentals", 17))).toBe(false);
    expect(run("Schedule a viewing of the last apartment", page("/rentals"))).toBe(false);
    expect(run("Schedule a viewing of the last apartment", hints)).toBe(true);
  });

  it("accepts this/that only when the renter has selected a listing", () => {
    const selected = {
      get: (key: string) =>
        key === "ag-ui"
          ? { context: [
              { description: RENTAL_A2UI_CONTEXT_DESCRIPTION,
                value: JSON.stringify(["37a05b09-f560-4776-92fd-b8bb2b92e611", "37a05b09-f560-4776-92fd-b8bb2b92e612", "37a05b09-f560-4776-92fd-b8bb2b92e613", "37a05b09-f560-4776-92fd-b8bb2b92e614", "37a05b09-f560-4776-92fd-b8bb2b92e615", "37a05b09-f560-4776-92fd-b8bb2b92e616"]) },
              { description: "Active MDE discovery page, filters, and explicitly selected visible public item.",
                value: JSON.stringify({ route: "/rentals", selectedPublicEntityId: "37a05b09-f560-4776-92fd-b8bb2b92e611" }) },
            ] }
          : undefined,
    };
    expect(run("Can you book a tour of this apartment?", selected)).toBe(true);
  });

  it("leaves timing questions, unrelated requests and unreferenced requests to the model", () => {
    expect(run("When can I view the second apartment?")).toBe(false);
    expect(run("Show the second apartment as a card")).toBe(false);
    expect(run("Schedule a viewing")).toBe(false);
  });

  it("fires only on the first step, on the Rentals page, with published results", () => {
    expect(run("Request a viewing of the second apartment", hints, 1)).toBe(false);
    expect(run("Request a viewing of the second apartment", page("/chat"))).toBe(false);
    expect(run("Request a viewing of the second apartment", noHints)).toBe(false);
  });
});
