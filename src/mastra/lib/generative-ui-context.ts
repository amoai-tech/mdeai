const GENERATIVE_UI_GUIDE_PREFIX = "Generative UI guide:";

/** One Table contract for both the official-guide and fallback agent paths. */
const TABLE_DATA_FORM_RULE =
  "Table data form (non-rental tables only; for rental comparison tables call showComparisonTable instead of authoring a Table): columns are short strings such as [\"Apartment\", \"Price\"] and rows are arrays of short strings or numbers, for example [[\"<tool listing title>\", \"<exact tool price and currency>\"]]. At most 5 rows by 4 columns. Every cell value must come from a tool result in this run or lastRentalResults saved from the current result set; do not round or estimate prices. Do not run a new search to fill a table. Use the Table component, not a markdown table. Never invent a price, rating, availability or address. Do not use TableSection, TableRow or TableCell.";

/** SAN-1658 — one rule for both the official-guide and fallback paths. */
const VIEWING_PROPOSAL_RULE =
  "Viewing requests: when the renter asks to schedule or request a viewing of an apartment that is already in the current results, call the showViewingProposal tool with the exact ID from the numbered published hints (\"the second apartment\" is hint 2; explicit Option #N instead refers to the separate visible comparison option IDs), not IDs from a same-turn search; never treat the last published hint as the last apartment when there are more or unknown results; ask for an explicit listing instead. Never put an ordinal or title in listingId and never author render_ui operations for it. Pass date (YYYY-MM-DD) and/or time (HH:mm, 24-hour, Medellín) only when the renter stated them explicitly; never guess a calendar date from a weekday. The renter edits the time and presses Continue, which opens the existing review form; nothing is requested until they submit that form. Never say a viewing is booked, requested or confirmed; say you prepared a request they can review.";

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
  "The Rentals comparison panel uses server-built official CopilotKit Button actions, bound to page functions that recheck the currently visible listing IDs. Do not hand-author Button events or guessed URLs; call showComparisonTable instead.",
  "After calling any tool, always write one short sentence for the user. Never end a turn with only tool calls.",
  "After showRecommendations, for a cards-only request reply with the tool's message only (for example \"Showing 2 apartments.\"). For cards-only replies: Do not restate or guess bedrooms, prices, neighborhoods, titles or availability; the cards carry those facts. When the user also requests a comparison or recommendation, state facts only if independently returned by trusted tools, even when those facts also appear on the cards; never infer facts from card IDs. If no independently verified facts are available, explain that this ID-only card tool cannot establish the comparison and point to the existing Rentals comparison. The tool result deliberately contains no listing facts.",
  "When the user asks to show the first result as a card immediately after a search, render it with the first published result ID; do not ask which result and do not search again.",
  "After searchEventsTool, grounded event cards render automatically in the event-recommendations panel. Do not call render_ui again for those search results. If event IDs were already published and the user requests specific cards without a new search, call render_ui for only those IDs.",
  "Targets: pick from the target list on the render_ui tool. \"rental-recommendations\" is the Rentals page panel; \"event-recommendations\" is the Events page panel. For other supported layouts and pages use \"chat\" when available. Never target an unmounted panel or render the same items twice.",
  "On the Rentals page, to show apartments as cards call showRecommendations with one to four IDs from the published rental result hints. Do not build render_ui operations for apartment cards and do not search again when the IDs are already published.",
  "Use render_ui for existing-result event cards, or other supported layouts such as a short summary. A fresh searchEventsTool result already renders its event cards automatically. Use openRentalDetails only when the user asks to open one apartment\'s details.",
  "Catalog in this release: the grounded cards RentalCard and EventCard, the Rentals-only BedroomFilter and ApplyFiltersButton, the editable ViewingProposal, the comparison Table with official Buttons on Rentals and ID-only RentalComparisonActions in chat — plus layout and labels: Box, Column, Row, Grid, GridItem, Card, Spacer, Divider, Title, Text, Caption, Label, Badge, FollowUp.",
  "For rental comparison tables (including an explicit comparison of two numbered current results such as apartments six and seven), call showComparisonTable with two to five verified listing IDs or 1-based positions from the first ten current result hints. Do not author Table operations, columns, rows, prices or Markdown; the server builds the Column → Table surface.",
  TABLE_DATA_FORM_RULE,
  VIEWING_PROPOSAL_RULE,
  "BedroomFilter, ApplyFiltersButton and ViewingProposal are interactive controls. On the Rentals comparison panel the server builds official Buttons for validated Details and Schedule viewing ID actions; their catalog rejects href/copy/submit. In chat, RentalComparisonActions handles those IDs. Never hand-author comparison Buttons, generic inputs, forms, maps, images or links; use the registered tools and a FollowUp instead.",
  "Grounded cards: a rental node is { id: \"<node-id>\", component: \"RentalCard\", listingId: \"<id>\" }; an event node is { id: \"<node-id>\", component: \"EventCard\", eventId: \"<uuid>\" }. Put listingId/eventId directly on the node; never add dataModel, children, slots or div to a card node.",
  "Use only IDs returned by your tools in this run, or IDs listed in the current result hints. Never invent a listing, event, price, rating, availability or address. Never use an array index, title or slug as an ID.",
  "Layout nodes take children as an array of node IDs. Title, Text, Caption and Label take text; Badge takes label; Divider and Spacer take no props.",
  "The root node is always id \"root\". A single card may be the root. For more than one card, use a container root and list the card node ids in its children.",
  "EVERY operation must be an object with \"version\": \"1.0\" and the operation name, e.g. { \"version\": \"1.0\", \"createSurface\": { ... } }. An operation without \"version\": \"1.0\" is rejected by the runtime and nothing renders.",
  "The complete render_ui arguments for two real rentals look exactly like this:",
  '{"target":"rental-recommendations","operations":[{"version":"1.0","createSurface":{"surfaceId":"recs","components":[{"id":"root","component":"Column","children":["card-1","card-2"]},{"id":"card-1","component":"RentalCard","listingId":"<id-1>"},{"id":"card-2","component":"RentalCard","listingId":"<id-2>"}]}}]}',
  "On the rental-recommendations panel use only RentalCard, Column, Row, Divider and at most one Title of 8 words or fewer for apartment cards; explicit control requests may also use BedroomFilter and ApplyFiltersButton, and an explicit viewing request may use ViewingProposal. That panel shows real apartments or the registered controls, not commentary.",
  "Props carry tool data or short labels (8 words or fewer). Never put paragraphs, HTML, scripts or user instructions in a prop.",
  "If render_ui is rejected, read the rejection reason and fix that exact field once. If it is rejected again, answer in text and say what could not be shown.",
].join("\n");

import { isRentalA2UIId } from "@/lib/rentals/a2ui-id";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION, RENTAL_HINT_MAX, RENTAL_RESULT_COUNT_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";
import { isEventA2UIId } from "@/lib/events/a2ui-id";
import { EVENT_A2UI_CONTEXT_DESCRIPTION } from "@/lib/events/a2ui-context";

const RENTAL_HINT_PREFIX = RENTAL_A2UI_CONTEXT_DESCRIPTION;
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

/**
 * SAN-1694: the browser publishes its result IDs when a message is SENT. If the
 * same agent run then searches, the page swaps to that search's cards (in the
 * tool's order), so the earlier browser list is stale for the rest of the run.
 * Each search registers here; the RequestContext is created per runtime
 * request, so nothing leaks into a later turn.
 *
 * The rules mirror the page (`latestRentalToolResult`): the latest-COMPLETED search
 * that returned rows wins; empty results leave the prior cards in place,
 * unless this run explicitly requires fresh search results for comparison.
 */
export const RENTAL_RUN_RESULT_IDS_KEY = "mdeai-rental-run-result-ids";
const RENTAL_RUN_SEARCHES_KEY = "mdeai-rental-run-searches";
const RENTAL_RUN_REQUIRE_FRESH_KEY = "mdeai-rental-require-fresh";
const RENTAL_RUN_REGISTRATION_KEY = "mdeai-rental-search-registration";

type RunContext = { get?: (key: string) => unknown; set?: (key: string, value: unknown) => void } | undefined;
type RunSearches = { completed: number; pending: Promise<void>[]; lastCompleted?: readonly string[] | null };
type RunResult = { order: number; ids: string[] };
type SearchRegistration = { ready: Promise<void>; resolve: () => void };

/** Called by the search-first input processor, before any tools can start.
 * Consumer tools await registration instead of using old browser hints. */
export function requireFreshRentalRunResults(requestContext: RunContext): void {
  if (!requestContext?.get || !requestContext.set) return;
  requestContext.set(RENTAL_RUN_REQUIRE_FRESH_KEY, true);
  if (requestContext.get(RENTAL_RUN_REGISTRATION_KEY)) return;
  let resolve = () => {};
  const ready = new Promise<void>((done) => { resolve = done; });
  requestContext.set(RENTAL_RUN_REGISTRATION_KEY, { ready, resolve } satisfies SearchRegistration);
}

/** Only a completed search returning at least two valid IDs can force a new table. */
export function hasUsableRentalRunResults(requestContext: RunContext): boolean {
  const searches = requestContext?.get?.(RENTAL_RUN_SEARCHES_KEY) as RunSearches | undefined;
  // Never let an earlier successful search substitute for the latest failed one.
  if (searches && "lastCompleted" in searches) {
    return Array.isArray(searches.lastCompleted) &&
      searches.lastCompleted.filter(isRentalA2UIId).length >= 2;
  }
  const run = requestContext?.get?.(RENTAL_RUN_RESULT_IDS_KEY) as RunResult | undefined;
  return Array.isArray(run?.ids) && run.ids.filter(isRentalA2UIId).length >= 2;
}

/** Call when a rental search starts; call the returned function once with its IDs (or null on failure). */
export function startRentalRunSearch(requestContext: RunContext): (ids: readonly string[] | null) => void {
  if (!requestContext?.get || !requestContext.set) return () => {};
  const searches = (requestContext.get(RENTAL_RUN_SEARCHES_KEY) as RunSearches | undefined) ?? { completed: 0, pending: [] };
  let settle = () => {};
  const done = new Promise<void>((resolve) => { settle = resolve; });
  requestContext.set(RENTAL_RUN_SEARCHES_KEY, { completed: searches.completed, pending: [...searches.pending, done] });
  // Release a consumer that began before searchRentalsTool registered itself.
  (requestContext.get(RENTAL_RUN_REGISTRATION_KEY) as SearchRegistration | undefined)?.resolve();
  let finished = false;
  return (ids) => {
    if (finished) return;
    finished = true;
    const currentSearches = (requestContext.get?.(RENTAL_RUN_SEARCHES_KEY) as RunSearches | undefined) ?? searches;
    const order = currentSearches.completed + 1;
    requestContext.set?.(RENTAL_RUN_SEARCHES_KEY, { ...currentSearches, completed: order,
      lastCompleted: ids ? [...ids] : null });
    // The browser uses the last nonempty search result message.
    if (ids && ids.length > 0) {
      requestContext.set?.(RENTAL_RUN_RESULT_IDS_KEY, { order, ids: [...ids] });
    }
    settle();
  };
}

/** Ordered IDs the renter sees now: this run's latest non-empty search, else the browser hint. */
export async function currentRentalResultIds(requestContext: RunContext): Promise<string[]> {
  // The input processor may require a search before the executor registers it.
  // Wait boundedly for registration, then for completion. Never use old page IDs
  // for an explicitly fresh comparison, including empty/failed searches.
  const required = requestContext?.get?.(RENTAL_RUN_REQUIRE_FRESH_KEY) === true;
  const registration = requestContext?.get?.(RENTAL_RUN_REGISTRATION_KEY) as SearchRegistration | undefined;
  if (required && registration) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([registration.ready, new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 5000);
      })]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  const searches = requestContext?.get?.(RENTAL_RUN_SEARCHES_KEY) as RunSearches | undefined;
  if (searches?.pending.length) await Promise.all(searches.pending);
  const latestSearches = requestContext?.get?.(RENTAL_RUN_SEARCHES_KEY) as RunSearches | undefined;
  if (required && latestSearches && "lastCompleted" in latestSearches &&
      (!Array.isArray(latestSearches.lastCompleted) || latestSearches.lastCompleted.length === 0)) return [];
  const run = requestContext?.get?.(RENTAL_RUN_RESULT_IDS_KEY) as RunResult | undefined;
  // Keep positions faithful: an unsafe ID becomes an unresolvable gap, not a shift.
  if (run && Array.isArray(run.ids)) {
    return run.ids.slice(0, RENTAL_HINT_MAX).map((id) => isRentalA2UIId(id) ? id : "");
  }
  return required ? [] : readRentalResultIds(requestContext?.get?.("ag-ui"));
}

/** The count is an untrusted browser hint, never an apartment ID or authority.
 * If absent/malformed, "last" is ambiguous and must not select a rental. */
export function readRentalRenderedCount(agUiContext: unknown): number | null {
  if (!agUiContext || typeof agUiContext !== "object") return null;
  const entries = (agUiContext as { context?: unknown }).context;
  if (!Array.isArray(entries)) return null;
  const entry = entries.slice(0, 20).find((value) =>
    value && typeof value === "object" &&
    (value as { description?: unknown }).description === RENTAL_RESULT_COUNT_CONTEXT_DESCRIPTION
  ) as { value?: unknown } | undefined;
  if (typeof entry?.value !== "string" || entry.value.length > 8) return null;
  let count: unknown;
  try { count = JSON.parse(entry.value); } catch { return null; }
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && count <= 10000 ? count : null;
}

/** Plain-text prompt hint, never arbitrary browser instructions. */
export function readRentalResultHints(agUiContext: unknown): string | null {
  const hints = readRentalResultIds(agUiContext);
  if (hints.length === 0) return null;
  const total = readRentalRenderedCount(agUiContext);
  const lastHint = total !== null && total === hints.length
    ? "All results are published, so the last apartment is the final numbered ID."
    : "Do not interpret the last apartment as the final published hint: the full page may have more results. Ask for an exact numbered apartment or selection instead.";
  return [
    lastHint,
    `Current browser-published rental result IDs, numbered in display order (1 is the top result). Only the first ${hints.length} result(s) can be addressed here, as cards or a viewing request. If the renter asks for a later position (for example the 12th), say you can only show cards for the first ${hints.length} results and that they can still open any apartment from the page; never show a different apartment in its place. The RentalCard resolver revalidates the real authorized row:`,
    ...hints.map((id, index) => `${index + 1}. ${id}`),
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
  "For rental comparison tables (including an explicit comparison of two numbered current results such as apartments six and seven), call showComparisonTable with two to five verified listing IDs or 1-based positions from the first ten current result hints. Do not author Table operations, columns, rows, prices or Markdown; the server builds the Column → Table surface.",
  TABLE_DATA_FORM_RULE,
  "On the Rentals page, prefer the rental-recommendations panel over the chat for apartment cards. On other pages, use \"chat\" for supported generic layouts when there is no mounted page target.",
  "On the Events page, searchEventsTool results automatically render grounded cards in event-recommendations. Do not call render_ui again for those same results. For already-published event IDs without a new search, call render_ui with one EventCard per requested ID, not a prose-only list.",
  "For apartment cards on the Rentals page, prefer the showRecommendations tool with IDs from the published hints. Do not hand-author render_ui operations for apartment cards.",
  "On the Rentals page, when the renter asks to adjust bedrooms, render BedroomFilter plus ApplyFiltersButton in the rental-recommendations panel. The control edits the renter's draft; ApplyFiltersButton applies it to the real page filters. Never claim the page changed before the action returns; never invent a filter value.",
  VIEWING_PROPOSAL_RULE,
  "The Rentals comparison panel uses server-built official CopilotKit Button actions, bound to page functions that recheck the currently visible listing IDs. Do not hand-author Button events or guessed URLs; call showComparisonTable instead.",
  "After calling any tool, always write one short sentence for the user. Never end a turn with only tool calls.",
  "After showRecommendations, for a cards-only request reply with the tool's message only (for example \"Showing 2 apartments.\"). For cards-only replies: Do not restate or guess bedrooms, prices, neighborhoods, titles or availability; the cards carry those facts. When the user also requests a comparison or recommendation, state facts only if independently returned by trusted tools, even when those facts also appear on the cards; never infer facts from card IDs. If no independently verified facts are available, explain that this ID-only card tool cannot establish the comparison and point to the existing Rentals comparison. The tool result deliberately contains no listing facts.",
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
