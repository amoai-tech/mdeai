import { describe, expect, it } from "vitest";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";
import { showComparisonTableTool } from "../show-comparison-table";
import { RENTAL_SUPABASE_KEY } from "../search-rentals";

const ids = [
  "37a05b09-f560-4776-92fd-b8bb2b92e601",
  "37a05b09-f560-4776-92fd-b8bb2b92e602",
  "37a05b09-f560-4776-92fd-b8bb2b92e603",
];

function context(rows: Array<Record<string, unknown>> = []) {
  const client = {
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows, error: null }),
      }),
    }),
  };
  return {
    requestContext: {
      get: (key: string) => key === RENTAL_SUPABASE_KEY
        ? client
        : key === "ag-ui"
          ? { context: [{ description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(ids) }] }
          : undefined,
    },
  };
}

const dbRow = (id: string, title: string, monthly: number | null, daily: number | null = null) => ({
  id, title, bedrooms: 2, price_monthly: monthly, price_daily: daily, currency: "COP",
});

type Result = {
  ok: boolean;
  rows: Array<{ id: string; title: string; bedrooms: number | null; price: number | null; currency: string | null; period: "month" | "night" | null }>;
  rejected: string[];
  message: string;
};
async function run(input: { ids?: string[]; positions?: number[] }, ctx: unknown): Promise<Result> {
  return await showComparisonTableTool.execute!(input, ctx as never) as unknown as Result;
}

describe("showComparisonTableTool", () => {
  it("resolves positions and returns verified facts in display order", async () => {
    const result = await run(
      { positions: [1, 2] },
      context([dbRow(ids[0], "First", 2_400_000), dbRow(ids[1], "Second", 2_500_000)]),
    );
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row.title)).toEqual(["First", "Second"]);
    expect(result.rows[0]).toMatchObject({ price: 2_400_000, currency: "COP", period: "month", bedrooms: 2 });
  });

  it("rejects a browser ID outside the published results", async () => {
    const result = await run(
      { ids: [ids[0], "37a05b09-f560-4776-92fd-b8bb2b92e699"] },
      context([dbRow(ids[0], "First", 2_400_000)]),
    );
    expect(result.ok).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("keeps missing prices unknown instead of inventing a rate", async () => {
    const result = await run(
      { ids: [ids[0], ids[1]] },
      context([dbRow(ids[0], "First", 2_400_000), dbRow(ids[1], "Second", null, null)]),
    );
    expect(result.ok).toBe(true);
    expect(result.rows[1]).toMatchObject({ price: null, period: null });
  });
});
