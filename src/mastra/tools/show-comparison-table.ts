import { createTool } from "@mastra/core/tools";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RENTAL_HINT_MAX } from "@/lib/rentals/a2ui-context";
import { readRentalResultIds } from "../lib/generative-ui-context";
import { RENTAL_SUPABASE_KEY } from "./search-rentals";
import { isActiveRentalsDiscoveryPage } from "../lib/discovery-agent-context";
import { COMPARISON_TABLE_TARGET, RENTAL_COMPARISON_TARGET, type ComparisonTarget } from "../lib/comparison-table-ui";

const MAX_APARTMENTS = 5;

export const comparisonInputSchema = z.object({
  ids: z.array(z.string().min(1).max(128)).min(2).max(MAX_APARTMENTS).optional()
    .describe("Two to five listing IDs from the current result hints, in display order."),
  positions: z.array(z.number().int().min(1).max(RENTAL_HINT_MAX)).min(2).max(MAX_APARTMENTS).optional()
    .describe("Two to five 1-based positions in the first ten result hints, e.g. [6, 7]."),
}).refine((value) => Boolean(value.ids?.length || value.positions?.length), {
  message: "Pass two to five IDs or positions from the current rental results.",
});

const rowSchema = z.object({
  id: z.string(),
  title: z.string(),
  neighborhood: z.string().nullable(),
  bedrooms: z.number().nullable(),
  furnished: z.boolean().nullable(),
  bathrooms: z.number().nullable(),
  sizeSqm: z.number().nullable(),
  wifiSpeedMbps: z.number().nullable(),
  amenities: z.array(z.string()),
  priceMonthly: z.number().nullable(),
  priceNightly: z.number().nullable(),
  currency: z.string().nullable(),
});

type Row = z.infer<typeof rowSchema>;
function knownPositive(value: unknown): number | null {
  if (value == null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
function knownNonnegative(value: unknown): number | null {
  if (value == null) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

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
    "Compare two to five previously shown apartments in a CopilotKit side-by-side table. Pass their exact IDs or 1-based positions (first ten hints, e.g. positions [6,7]), never prices or UI operations. Do not run a new rental search.",
  inputSchema: comparisonInputSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    target: z.enum([COMPARISON_TABLE_TARGET, RENTAL_COMPARISON_TARGET]).optional(),
    rows: z.array(rowSchema),
    rejected: z.array(z.string()),
    message: z.string(),
  }),
  execute: async (input, context) => {
    const agUiContext = (context as { requestContext?: { get?: (key: string) => unknown } })
      ?.requestContext?.get?.("ag-ui");
    const available = readRentalResultIds(agUiContext);
    if (available.length < 2) {
      return { ok: false, rows: [], rejected: [], message: "Search for apartments first; there are fewer than two current results." };
    }
    const unresolved: string[] = [];
    const requested = input.ids?.length ? input.ids : (input.positions ?? []).flatMap((position) => {
      const id = available[position - 1];
      if (!id) { unresolved.push(`Result ${position} is not in the current hints`); return []; }
      return [id];
    });
    const seen = new Set<string>();
    const ids = requested.filter((id) => {
      if (!available.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, MAX_APARTMENTS);
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
    const byId = new Map((data ?? []).map((row) => [String(row.id), {
      id: String(row.id),
      title: typeof row.title === "string" && row.title.trim() ? row.title : "Listing",
      neighborhood: typeof row.neighborhood === "string" ? row.neighborhood : null,
      bedrooms: knownNonnegative(row.bedrooms),
      furnished: typeof row.furnished === "boolean" ? row.furnished : null,
      bathrooms: knownNonnegative(row.bathrooms),
      sizeSqm: knownPositive(row.size_sqm),
      wifiSpeedMbps: knownPositive(row.wifi_speed),
      amenities: Array.isArray(row.amenities)
        ? row.amenities.filter((item: unknown): item is string => typeof item === "string").slice(0, 20)
        : [],
      priceMonthly: knownPositive(row.price_monthly),
      priceNightly: knownPositive(row.price_daily),
      currency: typeof row.currency === "string" && row.currency.trim() ? row.currency : null,
    } satisfies Row]));
    const rows = ids.flatMap((id) => byId.get(id) ?? []);
    const missing = ids.filter((id) => !byId.has(id));
    if (rows.length < 2) {
      return { ok: false, rows: [], rejected: [...rejected, ...missing], message: "Fewer than two apartments are accessible in this session." };
    }
    return {
      ok: true,
      target: (isActiveRentalsDiscoveryPage(agUiContext) ? RENTAL_COMPARISON_TARGET : COMPARISON_TABLE_TARGET) as ComparisonTarget,
      rows,
      rejected: [...rejected, ...missing],
      message: `Comparing ${rows.length} apartments using recorded listing facts.`,
    };
  },
});
