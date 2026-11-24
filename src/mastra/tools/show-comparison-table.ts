import { createTool } from "@mastra/core/tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RENTAL_HINT_MAX } from "@/lib/rentals/a2ui-context";
import { currentRentalResultIds, readRentalRenderedCount } from "../lib/generative-ui-context";
import { COMPARISON_CHEAPEST_KEY, COMPARISON_COP_MONTHLY_BUDGET_KEY, COMPARISON_POSITIONS_KEY } from "../lib/comparison-table-intent";
import { RENTAL_SUPABASE_KEY } from "./search-rentals";
import { isActiveRentalsDiscoveryPage } from "../lib/discovery-agent-context";
import { COMPARISON_TABLE_TARGET, RENTAL_COMPARISON_TARGET, comparisonRowSchema, comparisonRowFromApartment, type ComparisonTarget } from "../lib/comparison-table-ui";

const MAX_APARTMENTS = 5;

export const comparisonInputSchema = z.object({
  ids: z.array(z.string().min(1).max(128)).min(2).max(MAX_APARTMENTS).optional()
    .describe("Two to five listing IDs from the current result hints, in display order."),
  positions: z.array(z.number().int().min(1).max(RENTAL_HINT_MAX)).min(2).max(MAX_APARTMENTS).optional()
    .describe("Two to five 1-based positions in the first ten result hints, e.g. [6, 7]."),
}).refine((value) => Boolean(value.ids?.length || value.positions?.length), {
  message: "Pass two to five IDs or positions from the current rental results.",
});


function clientFor(context: unknown): SupabaseClient | null {
  // No anonymous fallback. The host must supply the existing request-scoped
  // user client so Supabase RLS applies to the same actor as rental search.
  const scoped = (context as { requestContext?: { get?: (key: string) => unknown } })
    ?.requestContext?.get?.(RENTAL_SUPABASE_KEY);
  return scoped && typeof scoped === "object" ? scoped as SupabaseClient : null;
}

export const showComparisonTableTool = createTool({
  id: "show-comparison-table",
  description:
    "Compare two to five previously shown apartments in a CopilotKit side-by-side table. Pass their exact IDs or 1-based positions (first ten hints, e.g. positions [6,7]), never prices or UI operations. For a request to compare the two cheapest shown apartments, pass two current positions; the server ranks the current authorized results by recorded monthly rent. Do not run a new rental search.",
  inputSchema: comparisonInputSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    target: z.enum([COMPARISON_TABLE_TARGET, RENTAL_COMPARISON_TARGET]).optional(),
    rows: z.array(comparisonRowSchema),
    rejected: z.array(z.string()),
    message: z.string(),
  }),
  execute: async (input, context) => {
    const requestContext = (context as { requestContext?: { get?: (key: string) => unknown } })?.requestContext;
    const agUiContext = requestContext?.get?.("ag-ui");
    // A search earlier in this run replaced the visible cards; positions and IDs
    // must address those, not the browser list sent before it (SAN-1694).
    const cheapest = requestContext?.get?.(COMPARISON_CHEAPEST_KEY) === true;
    const available = await currentRentalResultIds(requestContext, { preserveGaps: cheapest });
    if (available.filter(Boolean).length < 2) {
      return { ok: false, rows: [], rejected: [], message: "Search for apartments first; there are fewer than two current results." };
    }
    // Ranking an incomplete or malformed set would misrepresent "cheapest".
    // A browser count is only a hint, and never authorizes additional reads.
    const renderedCount = readRentalRenderedCount(agUiContext);
    if (cheapest && (available.some((id) => !id) ||
        (renderedCount !== null && renderedCount > available.length))) {
      return { ok: false, rows: [], rejected: [],
        message: "The complete current result list is not available for ranking. Narrow the search and compare again." };
    }
    const unresolved: string[] = [];
    // Resolve explicit user ordinals against the current authorized page hints,
    // even when the model supplied different IDs or positions.
    const serverPositions = (context as { requestContext?: { get?: (key: string) => unknown } })
      ?.requestContext?.get?.(COMPARISON_POSITIONS_KEY);
    const positions = z.array(z.number().int().min(1).max(RENTAL_HINT_MAX)).min(2).max(MAX_APARTMENTS)
      .safeParse(serverPositions);
    // Do not fall back to model IDs when valid server ordinals are outside
    // the current result hints: rejecting is safer than silently choosing
    // different apartments. This also guards against stale hint contexts.
    const selectedPositions = positions.success ? positions.data : input.positions;
    const requested = cheapest ? available.filter(Boolean) : selectedPositions?.length ? selectedPositions.flatMap((position) => {
      const id = available[position - 1];
      if (!id) { unresolved.push(`Result ${position} is not in the current hints`); return []; }
      return [id];
    }) : (input.ids ?? []);
    // Reject the whole request before reading the database. Comparing only the
    // valid subset would silently change which apartments the renter chose.
    if (unresolved.length) {
      return { ok: false, rows: [], rejected: unresolved, message: "One or more requested apartments are not in the current results." };
    }
    // Fail the entire comparison if *any* requested ID is stale. A partial
    // table would silently change the renter's requested pair or selection.
    const stale = requested.filter((id) => !available.includes(id));
    if (stale.length) {
      return { ok: false, rows: [], rejected: [...new Set(stale)],
        message: "One or more requested apartments are not in the current results." };
    }
    const seen = new Set<string>();
    const ids = requested.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, cheapest ? RENTAL_HINT_MAX : MAX_APARTMENTS);
    const rejected = [...unresolved, ...requested.filter((id) => !ids.includes(id))];
    if (ids.length < 2) {
      return { ok: false, rows: [], rejected, message: "Choose two distinct apartments from the current results." };
    }
    const client = clientFor(context);
    if (!client) {
      return { ok: false, rows: [], rejected, message: "Rental details are unavailable for this session." };
    }
    const { data, error } = await client.from("apartments")
      .select("id,title,neighborhood,bedrooms,bathrooms,furnished,size_sqm,wifi_speed,amenities,price_daily,price_monthly,currency")
      .in("id", ids);
    if (error) {
      return { ok: false, rows: [], rejected, message: "Rental details could not be read." };
    }
    const byId = new Map((data ?? []).map((row) => [String(row.id), comparisonRowFromApartment(row)]));
    let rows = ids.flatMap((id) => byId.get(id) ?? []);
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0 || rows.length < 2) {
      return {
        ok: false,
        rows: [],
        rejected: [...rejected, ...missing],
        message: missing.length > 0
          ? "One or more selected apartments are unavailable for comparison."
          : "Fewer than two apartments are accessible in this session.",
      };
    }
    let rankingMessage: string | undefined;
    if (cheapest) {
      const unpriced = rows.filter((row) => row.priceMonthly === null || row.currency === null);
      const priced = rows.filter((row) => row.priceMonthly !== null && row.currency !== null);
      // Missing prices are not zero, and currencies cannot be ranked without FX.
      // Report exclusions even when fewer than two comparable rows remain.
      const excludedPositions = unpriced.map((row) => `#${available.indexOf(row.id) + 1}`);
      const excluded = unpriced.length
        ? ` ${unpriced.length} apartment${unpriced.length === 1 ? "" : "s"} excluded due to missing monthly price or currency (search result${unpriced.length === 1 ? "" : "s"} ${excludedPositions.join(", ")}).`
        : "";
      rejected.push(...unpriced.map((row) => row.id));
      if (priced.length < 2 || new Set(priced.map((row) => row.currency)).size !== 1) {
        return { ok: false, rows: [], rejected,
          message: "There are fewer than two comparable recorded monthly prices in one currency among the current results." + excluded };
      }
      // Stable sort preserves the displayed order for equal recorded prices.
      rows = priced.sort((a, b) => a.priceMonthly! - b.priceMonthly!).slice(0, 2);
      rankingMessage = "Comparing the two lowest recorded monthly rents among the current results in one currency." + excluded;
    }
    // The search enforces the budget in SQL. This last guard ensures even a
    // malformed model search cannot present pricier results as budget matches.
    const cap = requestContext?.get?.(COMPARISON_COP_MONTHLY_BUDGET_KEY);
    if (typeof cap === "number" && (rows.some((row) =>
      row.currency !== "COP" || row.priceMonthly === null || row.priceMonthly > cap))) {
      return { ok: false, rows: [], rejected: [],
        message: "The selected apartments do not all have a confirmed monthly price within the requested COP budget." };
    }
    return {
      ok: true,
      target: (isActiveRentalsDiscoveryPage(agUiContext) ? RENTAL_COMPARISON_TARGET : COMPARISON_TABLE_TARGET) as ComparisonTarget,
      rows,
      rejected: [...rejected, ...missing],
      message: rankingMessage ?? `Comparing ${rows.length} apartments using recorded listing facts.`,
    };
  },
});
