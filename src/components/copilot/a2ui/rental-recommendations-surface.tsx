"use client";

import {
  GenerativeUISurface,
  useGenerativeUIRuntime,
} from "@copilotkit/react-core/v2/generative-ui";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";

/**
 * SAN-1656 — the first named page Surface: grounded apartment recommendations
 * rendered on the Rentals page, outside the chat transcript.
 *
 * The Surface only decides *where* UI can appear and *which* components may
 * appear there. It fetches nothing and stores nothing: every value a card shows
 * is resolved by the existing `RentalCard` catalog component from the current
 * authorized tool results on the concierge thread (see `mde-ui-catalog.tsx`).
 * That is why a forged or stale `listingId` renders "not in the current
 * authorized results" instead of invented facts, and why this feature adds no
 * second search engine, table or data path.
 *
 * `RentalCard` plus layout and one short heading only: the panel exists to
 * place real apartments next to the native results, not to become a second
 * free-form canvas. No control is allowed because no catalog function is
 * registered for this Surface yet (SAN-1655), so an authored button would be a
 * dead control beside real listings.
 */
export const RENTAL_RECOMMENDATIONS_SURFACE_ID = "rental-recommendations";

export const RENTAL_RECOMMENDATIONS_COMPONENTS = [
  "RentalCard",
  "Column",
  "Row",
  "Divider",
  // One short heading at most. No Text/Caption/Badge: the panel is for real
  // apartments, not model commentary, and the page already has its own heading.
  "Title",
] as const;

export function RentalRecommendationsSurface() {
  // Mount only where the page actually has a concierge agent. Without one there
  // is nothing that could target this panel, so registering the target would be
  // dead weight on every visit — and deterministic browser tests mount the app
  // without CopilotKit at all, where the stock Surface would throw.
  //
  // The guard is deliberately NOT "is this surface targeted": the runtime builds
  // the tool's target enum from surfaces that are mounted, so waiting for a
  // target before mounting is circular and the panel could never be reached.
  const runtime = useGenerativeUIRuntime();
  const coAgent = useOptionalConciergeCoAgent();
  if (!runtime || !coAgent) return null;

  return (
    <GenerativeUISurface
      id={RENTAL_RECOMMENDATIONS_SURFACE_ID}
      ui={mdeUI}
      components={[...RENTAL_RECOMMENDATIONS_COMPONENTS]}
      description="Grounded apartment recommendations for this Rentals page. Use this instead of the chat when someone asks which apartments match the page or its filters. One RentalCard per real listing from the current authorized results or the published rental-result IDs; do not run a new search just to fill this panel. Put the cards in a Column whose children are the card node ids; optionally one Title of 8 words or fewer. No commentary, no controls. Never state or invent a price, rating, availability or address."
      className="mb-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
      fallback={null}
      autoScroll={false}
    />
  );
}
