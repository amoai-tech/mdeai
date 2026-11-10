import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { readRentalResultIds } from "../lib/generative-ui-context";
import { isActiveRentalsDiscoveryPage } from "../lib/discovery-agent-context";
import { normalizeRecommendationIds } from "../lib/rental-recommendations-ui";

const inputSchema = z.object({
  ids: z
    .array(z.string().min(1).max(128))
    .min(1)
    .max(4)
    .describe(
      "One to four apartment IDs taken exactly from the current published result hints. Never invent or derive an ID.",
    ),
});

/**
 * SAN-1656 — the model picks apartments; the server owns the UI structure.
 *
 * Asking the model to author A2UI operations failed twice in live testing: left
 * free it renders nothing, forced it emits empty operations. A plain ID list is
 * a shape it produces reliably. Validate against bounded page-published
 * IDs; the existing RentalCard renderer independently resolves the actual
 * authorized rows. The transport builds the surface operation
 * from them (`recommendation-surface-bridge.ts`).
 *
 * The result carries no titles, prices, photos or availability: the card still
 * resolves every fact from the page's own authorized results, and rejects an ID
 * that is not among them.
 */
export const showRecommendationsTool = createTool({
  id: "show-recommendations",
  description:
    "Show one to four real apartments from the current results as cards on the Rentals page. Pass only IDs from the published result hints. Use this instead of describing apartments in text when the user asks to see them as cards.",
  inputSchema,
  outputSchema: z.object({
    ok: z.boolean(),
    ids: z.array(z.string()),
    rejected: z.array(z.string()),
    message: z.string(),
  }),
  execute: async ({ ids }, context) => {
    const agUiContext = context?.requestContext?.get("ag-ui");
    // Browser hints are not authorization. RentalCard alone resolves facts from
    // existing actual tool results, never this client-controlled ID list.
    const published = isActiveRentalsDiscoveryPage(agUiContext)
      ? new Set(readRentalResultIds(agUiContext)) : new Set<string>();
    const requested = normalizeRecommendationIds(ids);
    const verified = requested.filter((id) => published.has(id));
    const rejected = requested.filter((id) => !published.has(id));
    if (verified.length === 0) {
      return {
        ok: false,
        ids: [],
        rejected,
        message: "Those apartments are not in the current page results.",
      };
    }
    return {
      ok: true,
      ids: verified,
      rejected,
      message: `Showing ${verified.length} apartment${verified.length === 1 ? "" : "s"}.`,
    };
  },
});
