import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { lookupPublicDiscoveryItemFromServer } from "./lookup-public-discovery-item";
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
 * a shape it produces reliably, so this tool validates the IDs against the
 * authorized public catalogue and the transport builds the surface operation
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
  execute: async ({ ids }) => {
    const requested = normalizeRecommendationIds(ids);
    const verified: string[] = [];
    const rejected: string[] = [];
    for (const id of requested) {
      const found = await lookupPublicDiscoveryItemFromServer({ page: "rentals", id });
      if (found.found && found.data) verified.push(id);
      else rejected.push(id);
    }
    if (verified.length === 0) {
      return {
        ok: false,
        ids: [],
        rejected,
        message: "None of those apartments are in the current authorized results.",
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
