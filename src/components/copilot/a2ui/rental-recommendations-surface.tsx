"use client";

import { useSyncExternalStore } from "react";
import { VIEWING_PROPOSAL_SURFACE_ID } from "@/mastra/lib/viewing-proposal-ui";

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
 * free-form canvas. The only controls allowed are `BedroomFilter` and
 * `ApplyFiltersButton` (SAN-1655), only when the renter asks to change bedrooms
 * (wired to the page's real filter action), and `ViewingProposal` (SAN-1658),
 * only when the renter asks to schedule a viewing (it opens the existing review
 * form and writes nothing itself). The wording below
 * must agree with the allowlist and with `MDE_GENERATIVE_UI_RULES`; a test
 * enforces that so the model is never told two different things.
 */
export const RENTAL_RECOMMENDATIONS_SURFACE_ID = "rental-recommendations";

export const RENTAL_RECOMMENDATIONS_DESCRIPTION =
  "Grounded apartment recommendations for this Rentals page. Use this instead of the chat when someone asks which apartments match the page or its filters. One RentalCard per real listing from the current authorized results or the published rental-result IDs; do not run a new search just to fill this panel. Put the cards in a Column whose children are the card node ids; optionally one Title of 8 words or fewer. No commentary. The only controls allowed are BedroomFilter with ApplyFiltersButton, and only when the renter explicitly asks to change bedrooms, and ViewingProposal, and only when the renter explicitly asks to schedule a viewing of a listed apartment. Never state or invent a price, rating, availability or address.";

export const RENTAL_RECOMMENDATIONS_COMPONENTS = [
  "RentalCard",
  "Column",
  "Row",
  "Divider",
  // One short heading at most. No Text/Caption/Badge: the panel is for real
  // apartments, not model commentary, and the page already has its own heading.
  "Title",
  // SAN-1655 — the one interactive control, wired to the page's real filter action.
  "BedroomFilter",
  "ApplyFiltersButton",
  // SAN-1658 — an editable viewing request; Continue opens the existing review form.
  "ViewingProposal",
] as const;

const noopSubscribe = () => () => {};
const zero = () => 0;

export function RentalRecommendationsSurface({ comparisonActive = false }: { comparisonActive?: boolean } = {}) {
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
  const manager = runtime?.manager;
  useSyncExternalStore(manager?.subscribe ?? noopSubscribe, manager?.getVersion ?? zero, zero);
  const surface = manager?.getSurfaceForTarget(RENTAL_RECOMMENDATIONS_SURFACE_ID);
  const isViewingProposal = surface?.surfaceId === VIEWING_PROPOSAL_SURFACE_ID;
  if (!runtime || !coAgent) return null;

  return (
    <div hidden={comparisonActive && !isViewingProposal}>
    <GenerativeUISurface
      id={RENTAL_RECOMMENDATIONS_SURFACE_ID}
      ui={mdeUI}
      components={[...RENTAL_RECOMMENDATIONS_COMPONENTS]}
      description={RENTAL_RECOMMENDATIONS_DESCRIPTION}
      className="mb-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
      fallback={null}
      autoScroll={false}
    />
    </div>
  );
}
