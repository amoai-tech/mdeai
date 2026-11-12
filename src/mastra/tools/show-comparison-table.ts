import { createTool } from "@mastra/core/tools";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import { readRentalResultIds } from "../lib/generative-ui-context";
import { RENTAL_SUPABASE_KEY } from "./search-rentals";

const MAX_ROWS = 5;

const inputSchema = z
  .object({
    ids: z.array(z.string().min(1).max(128)).min(1).max(MAX_ROWS).optional()
      .describe("Listing IDs from the current result hints, in display order."),
    positions: z.array(z.number().int().min(1).max(MAX_ROWS)).min(1).max(MAX_ROWS).optional()
      .describe("1-based positions in the current result hints, e.g. [1, 2] for the first two."),
  })
  .refine((value) => Boolean(value.ids?.length || value.positions?.length), {
    message: "Pass ids or positions from the current rental results.",
  });

const rowSchema = z.object({
  id: z.string(),
  title: z.string(),
  bedrooms: z.number().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.enum(["month", "night"]).nullable(),
});

type Row = z.infer<typeof rowSchema>;

function clientFor(context: unknown): SupabaseClient | null {
  const scoped = (context as { requestContext?: { get?: (key: string) => unknown } })
    ?.requestContext?.get?.(RENTAL_SUPABASE_KEY);
  if (scoped) return scoped as SupabaseClient;
  const env = getSupabaseServerAnonEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * A deterministic comparison-table tool: the model chooses *which* already-shown
 * apartments, while the server fetches their facts and the transport builds the
 * official Column → Table operation. The model never authors UI or prices.
 */
export const showComparisonTableTool = createTool({
  id: "show-comparison-table",
  description:
    "Show two to five already-displayed apartments as a comparison table in chat. Pass listing IDs, or 1-based positions from the current result hints (for example [1, 2] for the first two). Never invent IDs, prices or facts. Never call search-rentals to fill a comparison.",
  inputSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    rows: z.array(rowSchema),
    rejected: z.array(z.string()),
    message: z.string(),
  }),
  execute: async (input, context) => {
    const agUiContext = (context as { requestContext?: { get?: (key: string) => unknown } })
      ?.requestContext?.get?.("ag-ui");
    const published = readRentalResultIds(agUiContext);
    if (published.length < 2) {
      return {
        ok: false,
        rows: [],
        rejected: [],
        message: "There are not enough current results to compare. Search for apartments first.",
      };
    }

    const requested = input.ids?.length
      ? input.ids
      : (input.positions ?? []).map((position) => published[position - 1]).filter(Boolean);
    const seen = new Set<string>();
    const ids = requested.filter((id): id is string => {
      if (!published.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, MAX_ROWS);
    const rejected = requested.filter((id) => !ids.includes(id));

    const client = clientFor(context);
    if (!client) {
      return { ok: false, rows: [], rejected, message: "Rental details are unavailable right now." };
    }

    const { data, error } = await client
      .from("apartments")
      .select("id,title,bedrooms,price_daily,price_monthly,currency")
      .in("id", ids);
    if (error) {
      return { ok: false, rows: [], rejected, message: "Rental details are unavailable right now." };
    }

    const byId = new Map(
      (data ?? []).map((row) => {
        const priceMonthly = row.price_monthly == null ? null : Number(row.price_monthly);
        const priceNightly = row.price_daily == null ? null : Number(row.price_daily);
        // Match the card/search period: when both exist, the nightly rate wins.
        const period = priceNightly != null && priceNightly > 0
          ? "night" : priceMonthly != null && priceMonthly > 0 ? "month" : null;
        const price = period === "night" ? priceNightly : period === "month" ? priceMonthly : null;
        return [String(row.id), {
          id: String(row.id),
          title: typeof row.title === "string" ? row.title : "Listing",
          bedrooms: row.bedrooms == null ? null : Number(row.bedrooms),
          price: price == null || !Number.isFinite(price) ? null : price,
          currency: typeof row.currency === "string" ? row.currency : null,
          period,
        } satisfies Row];
      }),
    );
    const rows = ids.flatMap((id) => byId.get(id) ?? []);
    const missing = ids.filter((id) => !byId.has(id));
    if (rows.length < 2) {
      return {
        ok: false,
        rows: [],
        rejected: [...rejected, ...missing],
        message: "Fewer than two of those apartments could be verified.",
      };
    }
    return {
      ok: true,
      rows,
      rejected: [...rejected, ...missing],
      message: `Comparing ${rows.length} apartments.`,
    };
  },
});
