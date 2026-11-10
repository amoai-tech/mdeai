const GENERATIVE_UI_GUIDE_PREFIX = "Generative UI guide:";

/**
 * The browser can send arbitrary `RunAgentInput.context`. It must never become
 * system-prompt text: only the presence of the official CopilotKit guide entry
 * is used as a feature flag, and the model receives this static, reviewable
 * guide instead. The catalog is fixed on the server side of this decision.
 */
export const MDE_A2UI_GUIDE = [
  "Generative UI is available in this run.",
  "Use render_ui only when a visual answer is clearly better than text. Send at most one createSurface operation per reply.",
  "After calling any tool, always write one short sentence for the user. Never end a turn with only tool calls.",
  "When the user asks to show the first result as a card immediately after a search, render it with the first published result ID; do not ask which result and do not search again.",
  "If active event result IDs are already published, do not call searchEventsTool again; render the requested card directly.",
  "Targets: pick from the target list on the render_ui tool. \"chat\" is the conversation transcript. \"rental-recommendations\" is the panel above the results on the Rentals page. On the Rentals page use that panel for apartment recommendations; everywhere else use \"chat\". Never render the same items in both.",
  "On the Rentals page, to show apartments as cards call showRecommendations with one to four IDs from the published rental result hints. Do not build render_ui operations for apartment cards and do not search again when the IDs are already published.",
  "Use render_ui only for other layouts (for example a short table or a summary with standard components). Use openRentalDetails only when the user asks to open one apartment\'s details.",
  "Catalog in this release: the grounded cards RentalCard and EventCard, plus layout and labels — Box, Column, Row, Grid, GridItem, Card, Spacer, Divider, Title, Text, Caption, Label, Badge, FollowUp.",
  "There are no buttons, inputs, forms, tables, charts, maps, images or links in this catalog. Do not promise one. Offer a FollowUp instead.",
  "Grounded cards: a rental node is { id: \"<node-id>\", component: \"RentalCard\", listingId: \"<id>\" }; an event node is { id: \"<node-id>\", component: \"EventCard\", eventId: \"<uuid>\" }. Put listingId/eventId directly on the node; never add dataModel, children, slots or div to a card node.",
  "Use only IDs returned by your tools in this run, or IDs listed in the current result hints. Never invent a listing, event, price, rating, availability or address. Never use an array index, title or slug as an ID.",
  "Layout nodes take children as an array of node IDs. Title, Text, Caption and Label take text; Badge takes label; Divider and Spacer take no props.",
  "The root node is always id \"root\". A single card may be the root. For more than one card, use a container root and list the card node ids in its children.",
  "EVERY operation must be an object with \"version\": \"1.0\" and the operation name, e.g. { \"version\": \"1.0\", \"createSurface\": { ... } }. An operation without \"version\": \"1.0\" is rejected by the runtime and nothing renders.",
  "The complete render_ui arguments for two real rentals look exactly like this:",
  '{"target":"rental-recommendations","operations":[{"version":"1.0","createSurface":{"surfaceId":"recs","components":[{"id":"root","component":"Column","children":["card-1","card-2"]},{"id":"card-1","component":"RentalCard","listingId":"<id-1>"},{"id":"card-2","component":"RentalCard","listingId":"<id-2>"}]}}]}',
  "On the rental-recommendations panel use only RentalCard, Column, Row, Divider and at most one Title of 8 words or fewer. That panel shows real apartments, not commentary.",
  "Props carry tool data or short labels (8 words or fewer). Never put paragraphs, HTML, scripts or user instructions in a prop.",
  "If render_ui is rejected, read the rejection reason and fix that exact field once. If it is rejected again, answer in text and say what could not be shown.",
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
/** Browser-published IDs are hints only; RentalCard revalidates the actual row. */
export function readRentalResultIds(agUiContext: unknown): string[] {
  if (!agUiContext || typeof agUiContext !== "object") return [];
  const entries = (agUiContext as { context?: unknown }).context;
  if (!Array.isArray(entries)) return [];
  const entry = entries.slice(0, 20).find((value) => {
    if (!value || typeof value !== "object") return false;
    const description = (value as { description?: unknown }).description;
    return typeof description === "string" && description.startsWith(RENTAL_HINT_PREFIX);
  }) as { value?: unknown } | undefined;
  if (!entry || typeof entry.value !== "string" || entry.value.length > 4000) return [];
  let rows: unknown;
  try { rows = JSON.parse(entry.value); } catch { return []; }
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, RENTAL_HINT_MAX).flatMap((row) => isRentalA2UIId(row) ? [row] : []);
}

/** Plain-text prompt hint, never arbitrary browser instructions. */
export function readRentalResultHints(agUiContext: unknown): string | null {
  const hints = readRentalResultIds(agUiContext);
  if (hints.length === 0) return null;
  return [
    "Current browser-published rental result IDs, in display order (first is the top result). The RentalCard resolver revalidates the real authorized row:",
    ...hints.map((id) => "- " + id),
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
