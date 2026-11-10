"use client";

import {
  GenerativeUISurface,
  useGenerativeUIRuntime,
} from "@copilotkit/react-core/v2/generative-ui";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";

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
 * `RentalCard` plus layout primitives only: the panel exists to place real
 * apartments next to the native results, not to become a second free-form
 * canvas. A wider allowlist belongs to a different Surface on a different page.
 */
export const RENTAL_RECOMMENDATIONS_SURFACE_ID = "rental-recommendations";

export const RENTAL_RECOMMENDATIONS_COMPONENTS = [
  "RentalCard",
  "Column",
  "Row",
  "Title",
  "Text",
  "Caption",
  "Badge",
  "Button",
  "Divider",
] as const;

export function RentalRecommendationsSurface() {
  // Deterministic browser tests mount the app without CopilotKit; the stock
  // surface requires the generative-UI runtime and throws without it.
  const runtime = useGenerativeUIRuntime();
  if (!runtime) return null;

  return (
    <GenerativeUISurface
      id={RENTAL_RECOMMENDATIONS_SURFACE_ID}
      ui={mdeUI}
      components={[...RENTAL_RECOMMENDATIONS_COMPONENTS]}
      description="Grounded apartment recommendations for this Rentals page. Use this instead of the chat when someone asks which apartments match the page, the filters, or a rental search you just ran. Put one RentalCard per real listing returned by search-rentals in this run, inside a Column with a short Title. Never state or invent a price, rating, availability or address."
      className="mb-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
      fallback={null}
      autoScroll={false}
    />
  );
}
