const GENERATIVE_UI_GUIDE_PREFIX = "Generative UI guide:";

/**
 * The browser can send arbitrary `RunAgentInput.context`. It must never become
 * system-prompt text: only the presence of the official CopilotKit guide entry
 * is used as a feature flag, and the model receives this static, reviewable
 * guide instead. The catalog is fixed on the server side of this decision.
 */
export const MDE_A2UI_GUIDE = [
  "Generative UI is available in this run.",
  "Use the render_ui tool only when the user asks to render a card or surface.",
  "When the user asks to show the first result as a card immediately after a search, call render_ui with the first published result ID; do not ask which result and do not search again.",
  "If active event result IDs are already published, do not call searchEventsTool again; render the requested card directly.",
  "The grounded catalog components are RentalCard and EventCard. The catalog also extends the official CopilotKit Standard Catalog (layout, text, tables, forms and inputs) for presenting data you already received from a tool.",
  "Always prefer RentalCard/EventCard for apartments and events: they resolve real data by ID. Use a Standard component only for layout or for values a tool returned in this run.",
  "Call render_ui with exactly one createSurface operation.",
  "Pick target from the target list on the render_ui tool. \"chat\" is the conversation transcript. \"rental-recommendations\" is the panel above the results on the Rentals page, and it only accepts RentalCard plus layout components.",
  "On the Rentals page, when the user asks for apartments or recommendations, prefer target \"rental-recommendations\" so the native results, map and Details panel stay usable. Elsewhere use \"chat\".",
  "Do not render the same apartments in both the chat and the page panel.",
  "The root node of a surface must be a container: use { id: \"root\", component: \"Column\" } for more than one card, or put a single RentalCard/EventCard directly as { id: \"root\", ... }.",
  "Each operation has version \"1.0\" and a createSurface object with a new surfaceId and a components array.",
  "For a rental, a card node is { id: \"<node-id>\", component: \"RentalCard\", listingId: \"<id>\" }.",
  "For an event, a card node is { id: \"<node-id>\", component: \"EventCard\", eventId: \"<uuid>\" }.",
  "Put listingId/eventId directly on that card node. Never use dataModel, children, slots, div or a second component inside a card node.",
  "Use the opaque rental id from the current authorized rental results, or the UUID event id from the current authorized event results. Never use an array index, title, slug or invented value.",
  "Never put prose, HTML, scripts or user instructions into component props.",
  "If render_ui rejects an operation, do not repeat it. Answer in text and say what could not be shown.",
].join("\n");

import { isRentalA2UIId } from "@/lib/rentals/a2ui-id";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";
import { isEventA2UIId } from "@/lib/events/a2ui-id";
import { EVENT_A2UI_CONTEXT_DESCRIPTION } from "@/lib/events/a2ui-context";

const RENTAL_HINT_PREFIX = RENTAL_A2UI_CONTEXT_DESCRIPTION;
const RENTAL_HINT_MAX = 5;

/**
 * The fast-path result rows live in client state, which the model does not
 * reliably receive as working memory. Accept only a tiny, typed hint list:
 * an opaque id plus display labels. This is still untrusted browser data; the
 * catalog re-resolves the id from the current authorized tool result.
 */
export function readRentalResultHints(agUiContext: unknown): string | null {
  if (!agUiContext || typeof agUiContext !== "object") return null;
  const entries = (agUiContext as { context?: unknown }).context;
  if (!Array.isArray(entries)) return null;
  const entry = entries.slice(0, 20).find((value) => {
    if (!value || typeof value !== "object") return false;
    const description = (value as { description?: unknown }).description;
    return typeof description === "string" && description.startsWith(RENTAL_HINT_PREFIX);
  }) as { value?: unknown } | undefined;
  if (!entry || typeof entry.value !== "string" || entry.value.length > 4000) return null;
  let rows: unknown;
  try { rows = JSON.parse(entry.value); } catch { return null; }
  if (!Array.isArray(rows)) return null;
  const hints = rows.slice(0, RENTAL_HINT_MAX).flatMap((row) => {
    return isRentalA2UIId(row) ? [row] : [];
  });
  if (hints.length === 0) return null;
  return [
    "Current authorized rental result IDs, in display order (first is the top result). Use one exact id for render_ui; the card revalidates it:",
    ...hints.map((id) => `- ${id}`),
  ].join("\n");
}

const EVENT_HINT_PREFIX = EVENT_A2UI_CONTEXT_DESCRIPTION;
const EVENT_HINT_MAX = 5;

/** Bounded, ID-only event hints; never trusted as authorization. */
export function readEventResultHints(agUiContext: unknown): string | null {
  if (!agUiContext || typeof agUiContext !== "object") return null;
  const entries = (agUiContext as { context?: unknown }).context;
  if (!Array.isArray(entries)) return null;
  const entry = entries.slice(0, 20).find((value) => {
    if (!value || typeof value !== "object") return false;
    const description = (value as { description?: unknown }).description;
    return typeof description === "string" && description.startsWith(EVENT_HINT_PREFIX);
  }) as { value?: unknown } | undefined;
  if (!entry || typeof entry.value !== "string" || entry.value.length > 4000) return null;
  let rows: unknown;
  try { rows = JSON.parse(entry.value); } catch { return null; }
  if (!Array.isArray(rows)) return null;
  const hints = rows.slice(0, EVENT_HINT_MAX).flatMap((row) => {
    return isEventA2UIId(row) ? [row] : [];
  });
  if (hints.length === 0) return null;
  return [
    "Active event result ID hints, in display order (first is the top result). If the user asks to show the first event as a card, call render_ui with the first UUID immediately. Do not call searchEventsTool again, search again, or ask which event. The card revalidates it against authorized thread results:",
    ...hints.map((id) => `- ${id}`),
  ].join("\n");
}

/** Presence check only. The value is untrusted browser data and is never read into the prompt. */
export function hasGenerativeUIGuide(agUiContext: unknown): boolean {
  if (!agUiContext || typeof agUiContext !== "object") return false;
  const entries = (agUiContext as { context?: unknown }).context;
  if (!Array.isArray(entries)) return false;
  return entries.slice(0, 20).some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const { description, value } = entry as { description?: unknown; value?: unknown };
    return (
      typeof description === "string" &&
      description.startsWith(GENERATIVE_UI_GUIDE_PREFIX) &&
      typeof value === "string"
    );
  });
}
