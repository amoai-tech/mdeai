import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { isActiveRentalsDiscoveryPage } from "../lib/discovery-agent-context";

/**
 * SAN-1655 — a renderer-only tool: it decides *when* the control may appear.
 *
 * The bedroom picker edits a page-owned draft, and Apply calls the page's own
 * resolver, so this tool carries no values and performs no write. The transport
 * appends the valid `render_ui` call (`rental-filter-control-ui.ts`).
 */
export const showRentalFilterControlTool = createTool({
  id: "show-rental-filter-control",
  description:
    "Show the bedroom filter control on the Rentals page when the renter asks to adjust, change or choose bedrooms there. Use it instead of describing a control in text. It changes nothing until the renter presses Apply filters.",
  inputSchema: z.object({}),
  outputSchema: z.object({ ok: z.boolean(), message: z.string() }),
  execute: async (_input, context) => {
    const agUiContext = context?.requestContext?.get("ag-ui");
    if (!isActiveRentalsDiscoveryPage(agUiContext)) {
      return { ok: false, message: "The Rentals page is not the active page, so no filter control was shown." };
    }
    return { ok: true, message: "The bedroom control is ready; the renter changes it and presses Apply filters." };
  },
});
