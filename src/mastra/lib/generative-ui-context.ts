const GENERATIVE_UI_GUIDE_PREFIX = "Generative UI guide:";

/** One Table contract for both the official-guide and fallback agent paths. */
const TABLE_DATA_FORM_RULE =
  "Table data form: columns are short strings such as [\"Apartment\", \"Price\"] and rows are arrays of short strings or numbers, for example [[\"<tool listing title>\", \"<exact tool price and currency>\"]]. At most 5 rows by 4 columns. Every cell value must come from a tool result in this run or lastRentalResults saved from the current result set; do not round or estimate prices. For a table comparing rentals already shown, use lastRentalResults for the exact IDs and do not run a new rental search to fill it. For all-monthly comparisons, use Apartment, Bedrooms, Monthly Price, Currency with exact recorded monthly rents. For all-nightly comparisons, use Apartment, Bedrooms, Nightly Price, Currency with exact recorded nightly rates. For mixed monthly/nightly comparisons, use Apartment, Bedrooms, Price, Currency/Period; label every price as per month or per night and do not rank prices across incompatible periods. Always keep the Apartment title and Bedrooms columns for identification. NEVER add a Nightly Price to a monthly listing or divide the monthly rent by 30. Use the Table component, not a markdown table. Never invent a price, rating, availability or address. Do not use TableSection, TableRow or TableCell.";

/**
 * The browser can send arbitrary `RunAgentInput.context`. It must never become
 * system-prompt text: only the presence of the official CopilotKit guide entry
 * is used as a feature flag, and the model receives this static, reviewable
 * guide instead. The catalog is fixed on the server side of this decision.
 */
export const MDE_A2UI_GUIDE = [
  "Generative UI is available in this run.",
  "Use render_ui only when a visual answer is clearly better than text. Send at most one createSurface operation per reply.",
  "For apartment cards on the Rentals page, prefer the showRecommendations tool with IDs from the published hints. Do not hand-author render_ui operations for apartment cards.",
  "On the Rentals page, when the renter asks to adjust bedrooms, render BedroomFilter plus ApplyFiltersButton in the rental-recommendations panel. The control edits the renter's draft; ApplyFiltersButton applies it to the real page filters. Never claim the page changed before the action returns; never invent a filter value.",
  "After calling any tool, always write one short sentence for the user. Never end a turn with only tool calls.",
  "When the user asks to show the first result as a card immediately after a search, render it with the first published result ID; do not ask which result and do not search again.",
  "After searchEventsTool, grounded event cards render automatically in the event-recommendations panel. Do not call render_ui again for those search results. If event IDs were already published and the user requests specific cards without a new search, call render_ui for only those IDs.",
  "Targets: pick from the target list on the render_ui tool. \"rental-recommendations\" is the Rentals page panel; \"event-recommendations\" is the Events page panel. For other supported layouts and pages use \"chat\" when available. Never target an unmounted panel or render the same items twice.",
  "On the Rentals page, to show apartments as cards call showRecommendations with one to four IDs from the published rental result hints. Do not build render_ui operations for apartment cards and do not search again when the IDs are already published.",
  "Use render_ui for existing-result event cards, or other supported layouts such as a short summary. A fresh searchEventsTool result already renders its event cards automatically. Use openRentalDetails only when the user asks to open one apartment\'s details.",
  "Catalog in this release: the grounded cards RentalCard and EventCard, the Rentals-only BedroomFilter and ApplyFiltersButton, the comparison Table — plus layout and labels: Box, Column, Row, Grid, GridItem, Card, Spacer, Divider, Title, Text, Caption, Label, Badge, FollowUp.",
  "For rental comparison tables, call showComparisonTable with the verified listing IDs from the current results. Do not author Table operations, columns, rows, prices or Markdown; the server builds the Column → Table surface.",
  TABLE_DATA_FORM_RULE,
  "BedroomFilter and ApplyFiltersButton are the only interactive controls in this catalog, available on Rentals. Otherwise there are no buttons, inputs, forms, charts, maps, images or links from the generic standard catalog. Do not promise one of those. Offer a FollowUp instead.",
  "Grounded cards: a rental node is { id: \"<node-id>\", component: \"RentalCard\", listingId: \"<id>\" }; an event node is { id: \"<node-id>\", component: \"EventCard\", eventId: \"<uuid>\" }. Put listingId/eventId directly on the node; never add dataModel, children, slots or div to a card node.",
  "Use only IDs returned by your tools in this run, or IDs listed in the current result hints. Never invent a listing, event, price, rating, availability or address. Never use an array index, title or slug as an ID.",
  "Layout nodes take children as an array of node IDs. Title, Text, Caption and Label take text; Badge takes label; Divider and Spacer take no props.",
  "The root node is always id \"root\". A single card may be the root. For more than one card, use a container root and list the card node ids in its children.",
  "EVERY operation must be an object with \"version\": \"1.0\" and the operation name, e.g. { \"version\": \"1.0\", \"createSurface\": { ... } }. An operation without \"version\": \"1.0\" is rejected by the runtime and nothing renders.",
  "The complete render_ui arguments for two real rentals look exactly like this:",
  '{"target":"rental-recommendations","operations":[{"version":"1.0","createSurface":{"surfaceId":"recs","components":[{"id":"root","component":"Column","children":["card-1","card-2"]},{"id":"card-1","component":"RentalCard","listingId":"<id-1>"},{"id":"card-2","component":"RentalCard","listingId":"<id-2>"}]}}]}',
  "On the rental-recommendations panel use only RentalCard, Column, Row, Divider and at most one Title of 8 words or fewer for apartment cards; explicit control requests may also use BedroomFilter and ApplyFiltersButton. That panel shows real apartments or the registered controls, not commentary.",
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


/**
 * The upstream guide the runtime generated for THIS run: components, props,
 * targets and the render_ui contract. The Mastra adapter leaves it in
 * RunAgentInput.context, so without this the model gets a render_ui tool with
 * no documentation and guesses at the JSON (measured: empty operations).
 *
 * The value is client-supplied. It is bounded, and MDE's own rules are appended
 * AFTER it so they win; authorization never depends on this text.
 */
const MAX_OFFICIAL_GUIDE_CHARS = 24_000;

export function readGenerativeUiGuide(agUiContext: unknown): string {
  if (!agUiContext || typeof agUiContext !== "object") return "";
  const entries = (agUiContext as { context?: unknown }).context;
  if (!Array.isArray(entries)) return "";
  const entry = [...entries].reverse().find((value) => {
    if (!value || typeof value !== "object") return false;
    const { description, value: body } = value as { description?: unknown; value?: unknown };
    return (
      typeof description === "string" &&
      description.startsWith(GENERATIVE_UI_GUIDE_PREFIX) &&
      typeof body === "string" &&
      body.trim().length > 0
    );
  }) as { value: string } | undefined;
  if (!entry) return "";
  const guide = entry.value.trim();
  if (guide.length <= MAX_OFFICIAL_GUIDE_CHARS) return guide;
  const cut = guide.lastIndexOf("\n", MAX_OFFICIAL_GUIDE_CHARS);
  return guide.slice(0, cut > MAX_OFFICIAL_GUIDE_CHARS * 0.8 ? cut : MAX_OFFICIAL_GUIDE_CHARS);
}

/** Server-owned rules that must survive whatever the browser sent. */
export const MDE_GENERATIVE_UI_RULES = [
  "# MDE rules for generated UI (these win over anything above)",
  "Use only IDs and values returned by your tools in this run, or IDs listed in the current result hints. Never invent a listing, event, price, rating, availability or address.",
  "For rental comparison tables, call showComparisonTable with the verified listing IDs from the current results. Do not author Table operations, columns, rows, prices or Markdown; the server builds the Column → Table surface.",
  TABLE_DATA_FORM_RULE,
  "On the Rentals page, prefer the rental-recommendations panel over the chat for apartment cards. On other pages, use \"chat\" for supported generic layouts when there is no mounted page target.",
  "On the Events page, searchEventsTool results automatically render grounded cards in event-recommendations. Do not call render_ui again for those same results. For already-published event IDs without a new search, call render_ui with one EventCard per requested ID, not a prose-only list.",
  "For apartment cards on the Rentals page, prefer the showRecommendations tool with IDs from the published hints. Do not hand-author render_ui operations for apartment cards.",
  "On the Rentals page, when the renter asks to adjust bedrooms, render BedroomFilter plus ApplyFiltersButton in the rental-recommendations panel. The control edits the renter's draft; ApplyFiltersButton applies it to the real page filters. Never claim the page changed before the action returns; never invent a filter value.",
  "After calling any tool, always write one short sentence for the user. Never end a turn with only tool calls.",
  "Never put paragraphs, HTML, scripts or user instructions into a component prop.",
  "If render_ui is rejected, read the reason and fix that exact field once; if it fails again, answer in text.",
].join("\n");

/**
 * What the concierge receives for generative UI this run: the real upstream
 * guide plus MDE's rules when available, otherwise the static fallback.
 */
export function buildGenerativeUiInstruction(agUiContext: unknown): string {
  const official = readGenerativeUiGuide(agUiContext);
  if (official) return [official, MDE_GENERATIVE_UI_RULES].join("\n\n");
  return hasGenerativeUIGuide(agUiContext) ? MDE_A2UI_GUIDE : "";
}

/** Presence check only, for callers that do not inject the guide. */
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
