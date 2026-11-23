import { describe, expect, it } from "vitest";
import { comparisonCopMonthlyBudget, comparisonRequestedPositions, requestsFreshRentalDiscovery, hasAttemptedTool, hasCompletedTool, shouldContinueComparisonAfterRoute, shouldContinueComparisonAfterSearch, shouldContinueRouteAfterComparison, shouldFinishComparisonWithoutAnotherTool, shouldForceComparisonTable, shouldSearchBeforeComparison } from "../comparison-table-intent";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";
import { RENTAL_RUN_RESULT_IDS_KEY } from "../generative-ui-context";
import { routePlanForTurn, shouldForceRouteTool } from "../route-tool-choice";

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

describe("same-message rental search and comparison", () => {
  const messages = [user("Find apartments in Laureles and compare the first two in a table.")];

  it("forces a new search first, then a table only after two usable fresh IDs", () => {
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages, steps: [] })).toBe(true);
    expect(shouldContinueComparisonAfterSearch({ stepNumber: 0, messages, steps: [] })).toBe(false);
    const searched = [{ toolResults: [{ toolName: "searchRentalsTool" }] }];
    const freshContext = { get: (key: string) => key === RENTAL_RUN_RESULT_IDS_KEY
      ? { order: 1, ids: ids.slice(0, 2) } : undefined };
    expect(shouldSearchBeforeComparison({ stepNumber: 1, messages, steps: searched })).toBe(false);
    expect(shouldContinueComparisonAfterSearch({ stepNumber: 1, messages, steps: searched, requestContext: freshContext })).toBe(true);
    expect(shouldContinueComparisonAfterSearch({
      stepNumber: 2, messages, steps: [...searched, { toolCalls: [{ toolName: "showComparisonTable" }] }],
      requestContext: freshContext,
    })).toBe(false);
  });

  it("extracts an explicit COP ceiling without confusing apartment positions and money", () => {
    expect(comparisonCopMonthlyBudget([user("Compare first two under COP 3M.")])).toBe(3_000_000);
    expect(comparisonCopMonthlyBudget([user("Compare first two under COP 2,900,000.")])).toBe(2_900_000);
    expect(comparisonCopMonthlyBudget([user("Compare first two apartments.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the first two apartments in a table under COP 3M.")])).toEqual([1, 2]);
  });

  it("never forces a table after an empty search, a single result or a failed attempt", () => {
    const searched = [{ toolResults: [{ toolName: "searchRentalsTool" }] }];
    expect(shouldContinueComparisonAfterSearch({ stepNumber: 1, messages, steps: searched, requestContext: context })).toBe(false);
    expect(shouldContinueComparisonAfterSearch({ stepNumber: 1, messages, steps: searched,
      requestContext: { get: (key: string) => key === RENTAL_RUN_RESULT_IDS_KEY ? { order: 1, ids: ids.slice(0, 1) } : undefined },
    })).toBe(false);
    expect(shouldContinueComparisonAfterSearch({ stepNumber: 1, messages,
      steps: [{ toolCalls: [{ toolName: "searchRentalsTool" }] }], requestContext: context })).toBe(false);
  });

  it("does not start a new search when 'find' means analyze apartments already displayed", () => {
    const analysis = [user("Compare the first two apartments in a table and find the cheaper one.")];
    const filteredTable = [user("Show me a table of 2BR apartments in Laureles under $3M.")];
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages: filteredTable, steps: [] })).toBe(true);
    expect(shouldForceComparisonTable({ stepNumber: 0, messages: filteredTable, requestContext: context })).toBe(false);
    const referencedBedrooms = [user("Compare these two 3BR apartments in a table.")];
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages: referencedBedrooms, steps: [] })).toBe(false);
    expect(shouldForceComparisonTable({ stepNumber: 0, messages: referencedBedrooms, requestContext: context })).toBe(true);
    const numberedFilter = [user("Compare the first two apartments in a table under COP 3M.")];
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages: numberedFilter, steps: [] })).toBe(true);
    expect(shouldForceComparisonTable({ stepNumber: 0, messages: numberedFilter, requestContext: context })).toBe(false);
    const trailingBedrooms = [user("Compare the first two apartments in a table with 2BR under COP 3M.")];
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages: trailingBedrooms, steps: [] })).toBe(true);
    expect(shouldForceComparisonTable({ stepNumber: 0, messages: trailingBedrooms, requestContext: context })).toBe(false);
    const cheaperPrefix = [user("Find the cheaper of the first two apartments and put them in a table.")];
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages: cheaperPrefix, steps: [] })).toBe(false);
    expect(shouldForceComparisonTable({ stepNumber: 0, messages: cheaperPrefix, requestContext: context })).toBe(true);
    const newCheapest = [user("Find the cheapest apartments in Laureles and compare the first two.")];
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages: newCheapest, steps: [] })).toBe(true);
    expect(requestsFreshRentalDiscovery(newCheapest)).toBe(true);
    expect(requestsFreshRentalDiscovery(cheaperPrefix)).toBe(false);
    expect(requestsFreshRentalDiscovery([user("Can you help me find a time to view the second apartment?")])).toBe(false);
    expect(requestsFreshRentalDiscovery([user("Find a slot for a viewing of apartment two.")])).toBe(false);
    expect(requestsFreshRentalDiscovery([user("Find an appointment date for the first apartment.")])).toBe(false);
    expect(requestsFreshRentalDiscovery([user("Find apartments in Laureles and show the first one as a card.")])).toBe(true);
    const tableRequest = [user("Put the first two apartments in a table and find the cheaper one.")];
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages: tableRequest, steps: [] })).toBe(false);
    expect(shouldForceComparisonTable({ stepNumber: 0, messages: tableRequest, requestContext: context })).toBe(true);
    expect(shouldSearchBeforeComparison({ stepNumber: 0, messages: analysis, steps: [] })).toBe(false);
    expect(shouldForceComparisonTable({ stepNumber: 0, messages: analysis, requestContext: context })).toBe(true);
    expect(shouldContinueComparisonAfterSearch({
      stepNumber: 1, messages: analysis, steps: [{ toolResults: [{ toolName: "searchRentalsTool" }] }],
      requestContext: context,
    })).toBe(false);
    // Still search first for a genuine new neighborhood search.
    expect(shouldSearchBeforeComparison({
      stepNumber: 0, messages: [user("Find 2BR rentals in Laureles and compare the first two.")], steps: [],
    })).toBe(true);
  });

  it("does not turn a new search without an explicit table or comparison request into a forced comparison", () => {
    expect(shouldSearchBeforeComparison({
      stepNumber: 0,
      messages: [user("Find apartments in Laureles under COP 3M.")],
      steps: [],
    })).toBe(false);
  });
});


describe("comparison follow-up tool suppression", () => {
  it("allows the grounded table tool in the first step but prevents duplicate model-generated UI afterwards", () => {
    const messages = [user("Put the first two apartments in a table.")];
    expect(shouldFinishComparisonWithoutAnotherTool({ stepNumber: 0, messages, requestContext: context })).toBe(false);
    expect(shouldFinishComparisonWithoutAnotherTool({ stepNumber: 1, messages, requestContext: context })).toBe(false);
    const completed = [{ toolResults: [{ toolName: "showComparisonTable" }] }];
    expect(shouldFinishComparisonWithoutAnotherTool({ stepNumber: 1, messages, requestContext: context, steps: completed })).toBe(true);
    expect(shouldFinishComparisonWithoutAnotherTool({ stepNumber: 2, messages, requestContext: context, steps: completed })).toBe(true);
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
    expect(comparisonRequestedPositions([user("Find apartments in Laureles and compare the first two in a table.")])).toEqual([1, 2]);
    expect(comparisonRequestedPositions([user("Find 2BR rentals in Laureles and compare the first two.")])).toEqual([1, 2]);
    expect(comparisonRequestedPositions([user("Compare the first two in a table.")])).toEqual([1, 2]);
    expect(comparisonRequestedPositions([user("Compare the top 2-bedroom apartments in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the top 2 BR apartments in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the top two-bedroom apartments in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the top 2 bedrooms in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the top 2-bathroom apartments in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the top 2 bath apartments in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the first two-bedroom apartment with the third in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the first two-bathrooms with the third in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Compare the first two-bedroom apartments in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Put the first two columns in a table.")])).toBeNull();
    expect(comparisonRequestedPositions([user("Put the first two apartments in a table.")])).toEqual([1, 2]);
    expect(comparisonRequestedPositions([user("Compare the first two apartments in a table and find the cheaper one.")])).toEqual([1, 2]);
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


describe("multi-tool comparison + walking route", () => {
  const text = "Put the first two apartments in a table and give walking directions from Parque Lleras to Provenza.";
  const messages = [user(text)];
  const routeDone = [{ toolResults: [{ toolName: "computeRouteTool" }] }];
  const tableDone = [{ toolResults: [{ toolName: "showComparisonTable" }] }];
  const bothDone = [...routeDone, ...tableDone];

  it("detects both intents, preserving the first forced route", () => {
    expect(call(text)).toBe(true);
    expect(routePlanForTurn(messages)?.travelMode).toBe("WALK");
    expect(shouldForceRouteTool({ stepNumber: 0, messages, steps: [] })).toBe(true);
  });

  it("runs the comparison after the route and does not finish until both results exist", () => {
    expect(shouldContinueComparisonAfterRoute({
      stepNumber: 1, messages, requestContext: context, steps: routeDone, hasRouteIntent: true,
    })).toBe(true);
    expect(shouldFinishComparisonWithoutAnotherTool({
      stepNumber: 1, messages, requestContext: context, steps: routeDone, hasRouteIntent: true,
    })).toBe(false);
    expect(shouldContinueComparisonAfterRoute({
      stepNumber: 2, messages, requestContext: context, steps: bothDone, hasRouteIntent: true,
    })).toBe(false);
    expect(shouldFinishComparisonWithoutAnotherTool({
      stepNumber: 2, messages, requestContext: context, steps: bothDone, hasRouteIntent: true,
    })).toBe(true);
  });

  it("does not repeatedly force a tool that already failed without a result", () => {
    const attemptedRoute = [{ toolCalls: [{ toolName: "computeRouteTool" }] }];
    const attemptedTable = [{ toolCalls: [{ toolName: "showComparisonTable" }] }];
    expect(hasAttemptedTool(attemptedRoute, "computeRouteTool")).toBe(true);
    expect(hasCompletedTool(attemptedRoute, "computeRouteTool")).toBe(false);
    expect(shouldContinueComparisonAfterRoute({
      stepNumber: 1, messages, requestContext: context, steps: attemptedRoute, hasRouteIntent: true,
    })).toBe(true);
    expect(shouldContinueComparisonAfterRoute({
      stepNumber: 2, messages, requestContext: context,
      steps: [...attemptedRoute, ...attemptedTable], hasRouteIntent: true,
    })).toBe(false);
    expect(shouldContinueRouteAfterComparison({
      stepNumber: 1, messages, requestContext: context, steps: attemptedTable, hasRouteIntent: true,
    })).toBe(true);
    expect(shouldContinueRouteAfterComparison({
      stepNumber: 2, messages, requestContext: context,
      steps: [...attemptedTable, ...attemptedRoute], hasRouteIntent: true,
    })).toBe(false);
    expect(shouldFinishComparisonWithoutAnotherTool({
      stepNumber: 2, messages, requestContext: context,
      steps: [...attemptedTable, ...attemptedRoute], hasRouteIntent: true,
    })).toBe(false);
  });

  it("allows the route after a table-first result, and never finishes while route is pending", () => {
    expect(hasCompletedTool(tableDone, "showComparisonTable")).toBe(true);
    expect(hasCompletedTool(tableDone, "computeRouteTool")).toBe(false);
    expect(shouldContinueRouteAfterComparison({
      stepNumber: 1, messages, requestContext: context, steps: tableDone, hasRouteIntent: true,
    })).toBe(true);
    expect(shouldContinueRouteAfterComparison({
      stepNumber: 2, messages, requestContext: context, steps: bothDone, hasRouteIntent: true,
    })).toBe(false);
    expect(shouldFinishComparisonWithoutAnotherTool({
      stepNumber: 1, messages, requestContext: context, steps: tableDone, hasRouteIntent: true,
    })).toBe(false);
  });
});

describe("incomplete apartment references defer rather than compare the wrong subset", () => {
  it.each([
    "Compare apartments 1, 2 and 12 in a table.",
    "Compare apartments 1, 2 and 11 in a table.",
    "Compare the fifth apartment with the first two apartments in a table.",
    "Put the first two apartments in a table with 5 columns.",
    "Put the first two apartments in a table with 5 rows.",
    "Put the first two apartments in a table with 5.",
    "Compare apartments 1 and 2 with 5 columns.",
    "Compare apartments 1 and 2 with five columns.",
  ])("does not trust partial or unrelated numeric references: %s", (text) => {
    expect(comparisonRequestedPositions([user(text)])).toBeNull();
  });
  it.each([
    ["Put the first two apartments in a table.", [1, 2]],
    ["Compare the first two apartments with the fifth.", [1, 2, 5]],
    ["Compare the first two apartments with the 5th.", [1, 2, 5]],
    ["Compare apartments 1, 2 and 10.", [1, 2, 10]],
    ["Compare the 1st and 2nd apartments with the 5th.", [1, 2, 5]],
  ])("preserves all supported explicit positions: %s", (text, positions) => {
    expect(comparisonRequestedPositions([user(text)])).toEqual(positions);
  });
});
