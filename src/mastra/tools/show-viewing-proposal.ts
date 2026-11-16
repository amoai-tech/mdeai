import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { readRentalResultIds } from "../lib/generative-ui-context";
import { isActiveRentalsDiscoveryPage } from "../lib/discovery-agent-context";
import { normalizeRecommendationIds } from "../lib/rental-recommendations-ui";
import { isFutureInstant, resolvePreferredAtInstant } from "@/lib/leads/schedule-viewing-time";

/**
 * SAN-1658 — a renderer-only tool: it decides *which* apartment and *when* the
 * editable viewing request may appear. It performs no write. The transport
 * appends the valid `render_ui` call (`viewing-proposal-ui.ts`); the existing
 * review form is the only place a request is submitted.
 */
export const showViewingProposalTool = createTool({
  id: "show-viewing-proposal",
  description:
    "Show an editable viewing request for ONE apartment when the renter explicitly asks to schedule or request a viewing. Pass its exact ID from the numbered published result hints (\"the second apartment\" is hint 2). Pass date (YYYY-MM-DD) and time (HH:mm, 24-hour) only when the renter stated them; never guess a date from a weekday. Nothing is requested until the renter reviews and submits the form.",
  inputSchema: z.object({
    listingId: z.string().min(1).max(128).describe("Exact apartment ID from the numbered published result hints."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    listingId: z.string().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ listingId, date, time }, context) => {
    const agUiContext = context?.requestContext?.get("ag-ui");
    if (!isActiveRentalsDiscoveryPage(agUiContext)) {
      return { ok: false, message: "The Rentals page is not the active page, so no viewing request was shown." };
    }
    // Browser hints are not authorization; the proposal re-resolves the real row.
    const published = new Set(readRentalResultIds(agUiContext));
    const [safeId] = normalizeRecommendationIds([listingId]);
    if (!safeId || !published.has(safeId)) {
      return { ok: false, message: "That apartment is not in the current page results." };
    }
    // A date that is already past (or not a real calendar day) is a model guess,
    // not a preference: drop it and let the renter pick.
    let safeDate = date;
    if (safeDate) {
      const instant = resolvePreferredAtInstant(`${safeDate}T${time ?? "23:59"}`);
      if (!instant || !isFutureInstant(instant)) safeDate = undefined;
    }
    const safeTime = time && resolvePreferredAtInstant(`2099-01-01T${time}`) ? time : undefined;
    return {
      ok: true,
      listingId: safeId,
      ...(safeDate ? { date: safeDate } : {}),
      ...(safeTime ? { time: safeTime } : {}),
      message: "A viewing request is ready for the renter to review; nothing has been requested yet.",
    };
  },
});
