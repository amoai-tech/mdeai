"use client";

import {
  GenerativeUISurface,
  useGenerativeUIRuntime,
} from "@copilotkit/react-core/v2/generative-ui";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";

/**
 * SAN-1653 — the event counterpart of the rentals Surface.
 *
 * The concierge chat renders event answers through native `SearchToolResultCards`
 * today, so an A2UI event card could never appear: the agent had no target that
 * accepts `EventCard`. This Surface gives event results the same transport the
 * rentals panel already uses, without a second search path, table or renderer.
 *
 * Surfaces render in the live turn only: a page reload does not replay an earlier
 * surface, so the cards disappear until the next event search.
 *
 * Every value a card shows is resolved by the existing `EventCard` catalog
 * component from the current authorized tool results, so a forged or stale
 * `eventId` renders "not in the current authorized results" instead of inventing
 * a title, venue or price.
 */
export const EVENT_RECOMMENDATIONS_SURFACE_ID = "event-recommendations";

export const EVENT_RECOMMENDATIONS_COMPONENTS = [
  "EventCard",
  "Column",
  // One short heading at most; the chat already has its own voice.
  "Title",
] as const;

export function EventRecommendationsSurface() {
  // Only the runtime is required. The Events page has the concierge runtime and
  // the Ask MDE composer, but no co-agent provider, so requiring one here left the
  // target unregistered and every render_ui aimed at it rendered nothing.
  // Deterministic tests mount the app without CopilotKit, where this is null.
  const runtime = useGenerativeUIRuntime();
  if (!runtime) return null;

  return (
    <GenerativeUISurface
      id={EVENT_RECOMMENDATIONS_SURFACE_ID}
      ui={mdeUI}
      components={[...EVENT_RECOMMENDATIONS_COMPONENTS]}
      description="Grounded event recommendations for the concierge chat. Use this when someone asks which events match a date, neighborhood or category. One EventCard per real event from the current authorized search results; put the cards in a Column whose children are the card node ids, optionally one Title of 8 words or fewer. No commentary. Never state or invent a title, venue, date or price."
      className="mx-2 mb-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
      fallback={null}
      autoScroll={false}
    />
  );
}
