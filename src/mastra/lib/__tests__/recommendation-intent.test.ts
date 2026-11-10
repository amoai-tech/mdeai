import { describe, expect, it } from "vitest";
import { shouldRequestRecommendations } from "../recommendation-intent";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";

const hints = {
  get: (key: string) =>
    key === "ag-ui"
      ? { context: [{ description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(["37a05b09-f560-4776-92fd-b8bb2b92e611"]) }] }
      : undefined,
};
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
