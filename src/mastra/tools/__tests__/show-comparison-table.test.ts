import { describe, expect, it } from "vitest";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION, RENTAL_RESULT_COUNT_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";
import { COMPARISON_CHEAPEST_KEY, COMPARISON_COP_MONTHLY_BUDGET_KEY, COMPARISON_POSITIONS_KEY } from "../../lib/comparison-table-intent";
import { comparisonInputSchema, showComparisonTableTool } from "../show-comparison-table";
import { RENTAL_SUPABASE_KEY } from "../search-rentals";
import { RENTAL_RUN_RESULT_IDS_KEY, startRentalRunSearch } from "../../lib/generative-ui-context";

const ids = Array.from({ length: 10 }, (_, i) =>
  `37a05b09-f560-4776-92fd-b8bb2b92e6${String(i).padStart(2, "0")}`
);
function context(rows: Array<Record<string, unknown>> = [], { withClient = true, trustedPositions, visibleIds = ids, runIds, cheapest }: { withClient?: boolean; trustedPositions?: number[]; visibleIds?: string[]; runIds?: string[]; cheapest?: boolean } = {}) {
  const client = {
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows, error: null }),
      }),
    }),
  };
  return {
    requestContext: {
      get: (key: string) =>
        key === RENTAL_SUPABASE_KEY ? (withClient ? client : null)
          : key === COMPARISON_POSITIONS_KEY ? trustedPositions
          : key === COMPARISON_CHEAPEST_KEY ? cheapest
          : key === RENTAL_RUN_RESULT_IDS_KEY ? (runIds ? { order: 1, ids: runIds } : undefined)
          : key === "ag-ui" ? { context: [{ description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(visibleIds) }] }
            : undefined,
    },
  };
}
const dbRow = (id: string, title: string, monthly: number | null, daily: number | null = null) => ({
  id, title, bedrooms: 2, furnished: true, bathrooms: 1, neighborhood: "Laureles", size_sqm: 68,
  wifi_speed: 80, amenities: ["Balcony"], price_monthly: monthly, price_daily: daily, currency: "COP",
});
type Result = {
  ok: boolean;
  rows: Array<{ id: string; title: string; bedrooms: number | null; furnished: boolean | null; bathrooms: number | null;
    priceMonthly: number | null; priceNightly: number | null; currency: string | null;
    wifiSpeedMbps: number | null; neighborhood: string | null; sizeSqm: number | null; amenities: string[] }>;
  rejected: string[];
  message: string;
};
async function run(input: { ids?: string[]; positions?: number[] }, ctx: unknown): Promise<Result> {
  return await showComparisonTableTool.execute!(input, ctx as never) as unknown as Result;
}
describe("showComparisonTableTool", () => {
  // SAN-1694 prod receipt (23 Nov 2026): "find … and compare the first two" in
  // one message compared two apartments that were no longer on screen. The
  // browser list was sent before this run's search replaced the cards.
  const fresh = Array.from({ length: 3 }, (_, i) => `9b1c7e2a-0000-4000-8000-00000000000${i}`);

  it("resolves positions against a search that ran earlier in this run, not the older page list", async () => {
    const result = await run({ positions: [1, 2] }, context(
      [dbRow(fresh[0], "New first", 2_100_000), dbRow(fresh[1], "New second", 2_200_000)],
      { runIds: fresh },
    ));
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.id)).toEqual([fresh[0], fresh[1]]);
  });

  it("uses server-trusted bare first-two ordinals even if the model supplies older IDs", async () => {
    const freshRows = [
      dbRow(fresh[0], "New first", 2_100_000),
      dbRow(fresh[1], "New second", 2_200_000),
    ];
    const result = await run({ ids: [ids[0], ids[1]] }, context(freshRows, {
      runIds: fresh,
      trustedPositions: [1, 2],
    }));
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.id)).toEqual(fresh.slice(0, 2));
  });

  it("rejects apartments from the older page list once this run has searched again", async () => {
    const result = await run({ ids: [ids[0], ids[1]] }, context(
      [dbRow(ids[0], "Old first", 2_000_000), dbRow(ids[1], "Old second", 2_000_000)],
      { runIds: fresh },
    ));
    expect(result.ok).toBe(false);
    expect(result.rejected).toEqual([ids[0], ids[1]]);
  });

  it("keeps comparing the cards on screen when this run's search found nothing", async () => {
    // The page keeps its cards after an empty search, so must the tool.
    const { RequestContext } = await import("@mastra/core/request-context");
    const real = new RequestContext();
    const page = context([dbRow(ids[0], "Visible first", 2_000_000), dbRow(ids[1], "Visible second", 2_100_000),
      dbRow(fresh[0], "Never shown", 1_000_000)]).requestContext;
    for (const key of [RENTAL_SUPABASE_KEY, "ag-ui"]) real.set(key, page.get(key));
    startRentalRunSearch(real as never)([]);
    const result = await run({ positions: [1, 2] }, { requestContext: real });
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.id)).toEqual([ids[0], ids[1]]);
  });

  it("resolves position six and seven in display order (not limited to five)", async () => {
    const result = await run({ positions: [6, 7] }, context([
      dbRow(ids[6], "Seventh", 2_500_000), dbRow(ids[5], "Sixth", 2_400_000),
    ]));
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.title)).toEqual(["Sixth", "Seventh"]);
    expect(result.rows[0]).toMatchObject({
      priceMonthly: 2_400_000, currency: "COP", bedrooms: 2, bathrooms: 1,
      neighborhood: "Laureles", sizeSqm: 68, wifiSpeedMbps: 80, amenities: ["Balcony"], furnished: true,
    });
  });

  it("prefers numbered positions over conflicting model-supplied IDs", async () => {
    const result = await run(
      { positions: [2, 3], ids: [ids[2], ids[3]] },
      context([
        dbRow(ids[1], "Second", 2_400_000),
        dbRow(ids[2], "Third", 2_500_000),
        dbRow(ids[3], "Wrong fourth", 2_600_000),
      ]),
    );
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.id)).toEqual([ids[1], ids[2]]);
  });

  it("honors server-read ordinals over plausible but wrong model IDs and positions", async () => {
    const result = await run(
      { ids: [ids[3], ids[4]], positions: [4, 5] },
      context([
        dbRow(ids[1], "Actual second", 2_400_000),
        dbRow(ids[2], "Actual third", 2_500_000),
        dbRow(ids[3], "Wrong fourth", 4_500_000),
        dbRow(ids[4], "Wrong fifth", 7_500_000),
      ], { trustedPositions: [2, 3] }),
    );
    expect(result.ok).toBe(true);
    expect(result.rows.map((r) => r.id)).toEqual([ids[1], ids[2]]);
  });

  it("does not treat stale ordinal positions outside current hints as valid listings", async () => {
    const result = await run(
      { ids: [ids[0], ids[1]] },
      context([
        dbRow(ids[0], "First", 2_400_000),
        dbRow(ids[1], "Second", 2_500_000),
      ], { trustedPositions: [2, 5], visibleIds: ids.slice(0, 3) }),
    );
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("rejects any unresolved trusted positions before querying apartments", async () => {
    let queryCount = 0;
    const ctx = context([], { trustedPositions: [1, 2, 5], visibleIds: ids.slice(0, 3) });
    // A DB query would be an error: an incomplete selection must fail first.
    ctx.requestContext.get(RENTAL_SUPABASE_KEY);
    const result = await run({ ids: ids.slice(0, 2) }, {
      requestContext: {
        get: (key: string) => key === RENTAL_SUPABASE_KEY
          ? { from: () => { queryCount++; throw new Error("unexpected DB query"); } }
          : ctx.requestContext.get(key),
      },
    });
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toContain("Result 5 is not in the current hints");
    expect(queryCount).toBe(0);
  });

  it("reads both recorded prices without conversion", async () => {
    const result = await run({ ids: [ids[0], ids[1]] }, context([
      dbRow(ids[0], "Both rates", 2_400_000, 80_000),
      dbRow(ids[1], "Monthly only", 2_500_000),
    ]));
    expect(result.rows[0]).toMatchObject({ priceMonthly: 2_400_000, priceNightly: 80_000 });
    expect(result.rows[1]).toMatchObject({ priceMonthly: 2_500_000, priceNightly: null });
    expect(result.rows.map((r) => r.furnished)).toEqual([true, true]);
  });

  it("rejects all rows before the database read when one of three IDs is stale", async () => {
    let queries = 0;
    const base = context([dbRow(ids[0], "One", 2_000_000), dbRow(ids[1], "Two", 2_100_000)]);
    const result = await run({ ids: [ids[0], ids[1], "37a05b09-f560-4776-92fd-b8bb2b92e699"] }, {
      requestContext: { get: (key: string) => key === RENTAL_SUPABASE_KEY ? {
        from: () => { queries += 1; throw new Error("Must reject before DB"); },
      } : base.requestContext.get(key) },
    });
    expect(queries).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual(["37a05b09-f560-4776-92fd-b8bb2b92e699"]);
  });

  it("a budget-filtered fresh result table never falls back to pricier old cards", async () => {
    const freshContext = context([
      dbRow(fresh[0], "Under COP 3M", 2_400_000),
      dbRow(fresh[1], "Also under COP 3M", 2_800_000),
      dbRow(ids[0], "Old penthouse", 6_000_000),
      dbRow(ids[1], "Old penthouse 2", 7_000_000),
    ], { runIds: fresh });
    const result = await run({ positions: [1, 2] }, { requestContext: {
      get: (key: string) => key === COMPARISON_COP_MONTHLY_BUDGET_KEY ? 3_000_000 : freshContext.requestContext.get(key),
    } });
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.priceMonthly)).toEqual([2_400_000, 2_800_000]);
    expect(result.rows.every((row) => (row.priceMonthly ?? Infinity) < 3_000_000)).toBe(true);
    expect(result.rows.map((row) => row.id)).toEqual(fresh.slice(0, 2));
  });

  it("never displays an over-budget apartment as a COP 3M match", async () => {
    const ctx = context([dbRow(ids[0], "Cheap", 2_400_000), dbRow(ids[1], "Penthouse", 7_000_000)]);
    const result = await run({ positions: [1, 2] }, { requestContext: {
      get: (key: string) => key === COMPARISON_COP_MONTHLY_BUDGET_KEY ? 3_000_000 : ctx.requestContext.get(key),
    } });
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.message).toContain("budget");
  });

  it("rejects a forged ID outside the current result set", async () => {
    const result = await run({ ids: [ids[0], "37a05b09-f560-4776-92fd-b8bb2b92e699"] }, context([
      dbRow(ids[0], "First", 2_400_000),
    ]));
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("fails closed without request-scoped RLS client, not anonymous fallback", async () => {
    const result = await run({ positions: [1, 2] }, context([dbRow(ids[0], "A", 2_400_000), dbRow(ids[1], "B", 2_500_000)], { withClient: false }));
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("does not invent unknown prices, size, or Wi-Fi speed", async () => {
    const incomplete = { ...dbRow(ids[1], "Unknown", null), furnished: null, size_sqm: null, wifi_speed: null, amenities: null };
    const result = await run({ ids: [ids[0], ids[1]] }, context([
      dbRow(ids[0], "First", 2_400_000), incomplete,
    ]));
    expect(result.ok).toBe(true);
    expect(result.rows[1]).toMatchObject({
      priceMonthly: null, priceNightly: null, furnished: null, wifiSpeedMbps: null, sizeSqm: null, amenities: [],
    });
  });

  it("preserves true, false and unknown furnishing statuses from the authorized records", async () => {
    const rows = [
      { ...dbRow(ids[0], "Furnished", 2_400_000), furnished: true },
      { ...dbRow(ids[1], "Unfurnished", 2_500_000), furnished: false },
      { ...dbRow(ids[2], "Status missing", 2_300_000), furnished: null },
    ];
    const result = await run({ positions: [1, 2, 3] }, context(rows));
    expect(result.ok).toBe(true);
    expect(result.rows.map((r) => r.furnished)).toEqual([true, false, null]);
  });

  it("rejects a singleton comparison at input validation, before execution", () => {
    const schema = comparisonInputSchema;
    expect(schema.safeParse({ ids: [ids[0]] }).success).toBe(false);
    expect(schema.safeParse({ positions: [1] }).success).toBe(false);
    expect(schema.safeParse({ positions: [6, 7] }).success).toBe(true);
  });

  it("refuses inaccessible second row even when listed in browser hints", async () => {
    const result = await run({ ids: [ids[0], ids[1]] }, context([dbRow(ids[0], "First", 2_400_000)]));
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("rejects the whole comparison when one selected result is source-backed rather than a database apartment", async () => {
    const result = await run(
      { ids: [ids[0], ids[1], ids[2]] },
      context([
        dbRow(ids[0], "Database first", 2_400_000),
        dbRow(ids[1], "Database second", 2_500_000),
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([ids[2]]);
  });
});

describe("SAN-1694 current-result cheapest comparison", () => {
  it("chooses two lowest recorded monthly prices from current authorized IDs, ignoring model order", async () => {
    const result = await run({ ids: [ids[0], ids[3]] }, context([
      dbRow(ids[0], "Expensive", 4_200_000),
      dbRow(ids[1], "Cheapest", 2_400_000),
      dbRow(ids[2], "Second cheapest", 2_500_000),
      dbRow(ids[3], "Unknown monthly", null),
      dbRow(ids[4], "Not visible", 1_000_000),
    ], { visibleIds: ids.slice(0, 4), cheapest: true }));
    expect(result.ok).toBe(true);
    expect(result.rows.map(row => row.id)).toEqual([ids[1], ids[2]]);
    expect(result.rejected).toEqual([ids[3]]);
    expect(result.message).toContain("lowest recorded monthly rents");
    expect(result.message).toContain("1 apartment excluded");
    expect(result.message).toContain("search result #4");
    expect(result.message).toContain("missing monthly price or currency");
  });
  it("rejects malformed browser hints even without a published count", async () => {
    const result = await run({ positions: [1, 2] }, context([
      dbRow(ids[0], "First", 2_400_000), dbRow(ids[1], "Second", 2_500_000),
    ], { visibleIds: [ids[0], "bad entry", ids[1]], cheapest: true }));
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
  });
  it("discloses both missing currency and nightly-only listings without ranking them", async () => {
    const result = await run({ positions: [1, 2] }, context([
      dbRow(ids[0], "Monthly A", 2_400_000),
      dbRow(ids[1], "Monthly B", 2_500_000),
      dbRow(ids[2], "Nightly only", null, 50_000),
      { ...dbRow(ids[3], "Unknown currency", 1_000_000), currency: null },
    ], { visibleIds: ids.slice(0, 4), cheapest: true }));
    expect(result.ok).toBe(true);
    expect(result.rejected).toEqual([ids[2], ids[3]]);
    expect(result.message).toContain("2 apartments excluded");
    expect(result.message).toContain("search results #3, #4");
    expect(result.message).toContain("missing monthly price or currency");
  });
  it("breaks equal-price ties by visible order and rejects a truncated result set", async () => {
    const rows = [dbRow(ids[2], "Third", 2_400_000), dbRow(ids[1], "Second", 2_400_000), dbRow(ids[0], "First", 4_200_000)];
    const ctx = context(rows, { visibleIds: ids.slice(0, 3), cheapest: true });
    const ranked = await run({ positions: [1, 2] }, ctx);
    expect(ranked.rows.map(row => row.id)).toEqual([ids[1], ids[2]]);
    const originalGet = ctx.requestContext.get;
    ctx.requestContext.get = (key: string) => key === "ag-ui" ? { context: [
      { description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(ids.slice(0, 3)) },
      { description: RENTAL_RESULT_COUNT_CONTEXT_DESCRIPTION, value: "11" },
    ] } : originalGet(key);
    expect((await run({ positions: [1, 2] }, ctx)).ok).toBe(false);
  });
  it("does not rank mixed currencies or silently substitute inaccessible results", async () => {
    const mixed = await run({ positions: [1, 2] }, context([
      dbRow(ids[0], "COP", 2_400_000),
      { ...dbRow(ids[1], "USD", 400), currency: "USD" },
    ], { visibleIds: ids.slice(0, 2), cheapest: true }));
    expect(mixed.ok).toBe(false);
    const missing = await run({ positions: [1, 2] }, context([
      dbRow(ids[0], "Visible", 2_400_000),
      dbRow(ids[1], "Visible", 2_500_000),
    ], { visibleIds: ids.slice(0, 3), cheapest: true }));
    expect(missing.ok).toBe(false);
  });
});
