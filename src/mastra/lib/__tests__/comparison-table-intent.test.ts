import { describe, expect, it } from "vitest";
import { comparisonRequestedPositions, shouldFinishComparisonWithoutAnotherTool, shouldForceComparisonTable } from "../comparison-table-intent";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";

const ids = [
  "37a05b09-f560-4776-92fd-b8bb2b92e601",
  "37a05b09-f560-4776-92fd-b8bb2b92e602",
  "37a05b09-f560-4776-92fd-b8bb2b92e603",
  ...Array.from({ length: 7 }, (_, i) => `37a05b09-f560-4776-92fd-b8bb2b92e6${String(i + 3).padStart(2, "0")}`),
];
const context = {
  get: (key: string) => key === "ag-ui"
    ? { context: [{ description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(ids) }] }
    : undefined,
};
const user = (text: string) => ({ role: "user", content: { parts: [{ type: "text", text }] } });
const call = (text: string, ctx = context) => shouldForceComparisonTable({ stepNumber: 0, messages: [user(text)], requestContext: ctx });

describe("shouldForceComparisonTable", () => {
  it("forces the table tool for explicit current-result table requests", () => {
    expect(call("Put the first two apartments in a table.")).toBe(true);
    expect(call("Compare those two in a table.")).toBe(true);
    expect(call("Show the three apartments side by side.")).toBe(true);
    expect(call("Put those two in a table with bedrooms and price.")).toBe(true);
  });

  it("does not force ordinary comparisons or new searches", () => {
    expect(call("Compare the first two apartments.")).toBe(true);
    expect(call("Compare apartments six and seven.")).toBe(true);
    expect(call("Compare the sixth and seventh rentals side by side.")).toBe(true);
    expect(call("Find 2-bedroom apartments in a table under COP 3M.")).toBe(false);
    expect(call("Compare six-bedroom apartments in Laureles with seven-bedroom apartments in Poblado.")).toBe(false);
    expect(call("Show me apartments under COP 3M.")).toBe(false);
    expect(call("Show 2-bedroom apartments in a table.")).toBe(false);
    expect(call("Show two-bedroom apartments in a table.")).toBe(false);
    expect(call("Show six-bedroom apartments in a table.")).toBe(false);
    expect(call("Show ten-bedroom apartments in a table.")).toBe(false);
  });

  it("does not hijack new project or other non-rental comparisons from the concierge", () => {
    expect(call("Compare the first two new projects side by side.")).toBe(false);
    expect(call("Compare those two startups in a table.")).toBe(false);
    expect(call("Put the first two events in a table.")).toBe(false);
    expect(call("Compare apartments six and seven.")).toBe(true);
  });

  it("does not hijack restaurant table bookings", () => {
    expect(call("Book a table for two at a restaurant.")).toBe(false);
  });

  it("requires at least two published results", () => {
    const empty = { get: () => ({ context: [] }) };
    expect(call("Put the first two apartments in a table.", empty)).toBe(false);
  });
});


describe("comparison follow-up tool suppression", () => {
  it("allows the grounded table tool in the first step but prevents duplicate model-generated UI afterwards", () => {
    const messages = [user("Put the first two apartments in a table.")];
    expect(shouldFinishComparisonWithoutAnotherTool({ stepNumber: 0, messages, requestContext: context })).toBe(false);
    expect(shouldFinishComparisonWithoutAnotherTool({ stepNumber: 1, messages, requestContext: context })).toBe(true);
    expect(shouldFinishComparisonWithoutAnotherTool({ stepNumber: 2, messages, requestContext: context })).toBe(true);
  });

  it("does not suppress tools for other domains, fresh rental searches or missing hints", () => {
    for (const query of [
      "Find apartments under COP 3M.",
      "Compare the first two new projects side by side.",
      "Book a table for two at a restaurant.",
    ]) {
      expect(shouldFinishComparisonWithoutAnotherTool({
        stepNumber: 1, messages: [user(query)], requestContext: context,
      })).toBe(false);
    }
    expect(shouldFinishComparisonWithoutAnotherTool({
      stepNumber: 1, messages: [user("Put the first two apartments in a table.")],
      requestContext: { get: () => ({ context: [] }) },
    })).toBe(false);
  });
});


describe("server-owned displayed ordinal interpretation", () => {
  it("parses exact requested positions rather than accepting the model's IDs", () => {
    expect(comparisonRequestedPositions([user("Put the first two apartments in a table.")])).toEqual([1, 2]);
    expect(comparisonRequestedPositions([user("Compare the second and third apartments side by side.")])).toEqual([2, 3]);
    expect(comparisonRequestedPositions([user("Compare apartments six and seven.")])).toEqual([6, 7]);
    expect(comparisonRequestedPositions([user("Compare apartments 2nd and 3rd.")])).toEqual([2, 3]);
    expect(comparisonRequestedPositions([user("Compare apartments 1, 2 and 3.")])).toEqual([1, 2, 3]);
    expect(comparisonRequestedPositions([user("Compare the first two apartments and the fifth.")])).toEqual([1, 2, 5]);
    expect(comparisonRequestedPositions([user("Compare the first two apartments with the fifth.")])).toEqual([1, 2, 5]);
    expect(comparisonRequestedPositions([user("Compare the first two apartments vs the 4th.")])).toEqual([1, 2, 4]);
    expect(comparisonRequestedPositions([user("Compare the 1st and 2nd apartments with the 5th.")])).toEqual([1, 2, 5]);
    expect(comparisonRequestedPositions([user("Compare 1st ,  2nd and 3rd.")])).toEqual([1, 2, 3]);
    expect(comparisonRequestedPositions([user("Compare apartments 1, 2, 3, 4 and 5.")])).toEqual([1, 2, 3, 4, 5]);
  });

  it("never invents an ordinal for generic requests", () => {
    expect(comparisonRequestedPositions([user("Show these apartments in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare apartment prices.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare apartment 3 and 3.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare apartments 1, 2, 3, 4, 5 and 6.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare apartments 1 and 2 plus 5.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the first two apartments alongside the fifth.")])).toBeNull();
  });
});
