import { describe, expect, it } from "vitest";
import { parseDetailsCommand, parseComparisonActionCommand } from "@/lib/rentals/details-command";

describe("parseDetailsCommand", () => {
  it.each([
    ["Show me the details.", 1],
    ["show me the details", 1],
    ["Open the details.", 1],
    ["See details", 1],
    ["Show me the details for the first apartment.", 1],
    ["Show me the details for the second apartment.", 2],
    ["Open details of the third one.", 3],
    ["Show me details for the tenth apartment.", 10],
    ["Show me the details for apartment 2.", 2],
  ])("resolves %s to position %i", (text, index) => {
    expect(parseDetailsCommand(text)).toEqual({ index });
  });

  it("preserves a combined furnishing clear and exact rental Details command", () => {
    expect(parseDetailsCommand(
      "Either furnished or unfurnished is fine. Show me the details for the second apartment.",
    )).toEqual({ index: 2 });
    expect(parseDetailsCommand(
      "Either furnished or unfurnished is fine. Show me the details of the second event.",
    )).toBeNull();
  });

  it.each([
    "Show me the details of the second restaurant",
    "Show me the details of the second event",
    "Open details for the second café",
    "Show details for the third hotel",
  ])("does not redirect a different category to rental Details: %s", (text) => {
    expect(parseDetailsCommand(text)).toBeNull();
  });

  it("leaves a named apartment or a new search to the agent", () => {
    expect(parseDetailsCommand("Show me the details for Calle 10 #42-15.")).toBeNull();
    expect(parseDetailsCommand("Show me details about furnished apartments.")).toBeNull();
    expect(parseDetailsCommand("Find furnished apartments in Laureles.")).toBeNull();
  });
});

describe("explicit comparison actions", () => {
  it("parses option numbers without conflating them with search positions", () => {
    expect(parseDetailsCommand("Open Details for Option #1.")).toEqual({ index: 1, comparison: true });
    expect(parseComparisonActionCommand("Show Option #2 on the map.")).toEqual({ action: "map", index: 2 });
    expect(parseComparisonActionCommand("Schedule a viewing for Option #2.")).toEqual({ action: "viewing", index: 2 });
    expect(parseComparisonActionCommand("Schedule a viewing for Option #2 tomorrow at 3pm")).toBeNull();
    expect(parseComparisonActionCommand("Is Option #2 on the map?")).toBeNull();
  });
});
