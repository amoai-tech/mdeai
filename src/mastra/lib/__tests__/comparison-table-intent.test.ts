import { describe, expect, it } from "vitest";
import { shouldForceComparisonTable } from "../comparison-table-intent";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";

const ids = [
  "37a05b09-f560-4776-92fd-b8bb2b92e601",
  "37a05b09-f560-4776-92fd-b8bb2b92e602",
  "37a05b09-f560-4776-92fd-b8bb2b92e603",
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
    expect(call("Compare the first two apartments.")).toBe(false);
    expect(call("Find 2-bedroom apartments in a table under COP 3M.")).toBe(false);
    expect(call("Show me apartments under COP 3M.")).toBe(false);
    expect(call("Show 2-bedroom apartments in a table.")).toBe(false);
    expect(call("Show two-bedroom apartments in a table.")).toBe(false);
    expect(call("Show six-bedroom apartments in a table.")).toBe(false);
    expect(call("Show ten-bedroom apartments in a table.")).toBe(false);
  });

  it("does not hijack restaurant table bookings", () => {
    expect(call("Book a table for two at a restaurant.")).toBe(false);
  });

  it("requires at least two published results", () => {
    const empty = { get: () => ({ context: [] }) };
    expect(call("Put the first two apartments in a table.", empty)).toBe(false);
  });
});
