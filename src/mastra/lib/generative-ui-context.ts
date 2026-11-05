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
  "The only catalog component is RentalCard.",
  "Call render_ui with target \"chat\" and exactly one createSurface operation.",
  "Each operation has version \"1.0\" and a createSurface object with a new surfaceId and a components array.",
  "components must contain exactly one node: { id: \"root\", component: \"RentalCard\", listingId: \"<id>\" }.",
  "Put listingId directly on that component. Never use dataModel, children, slots, div or a second component.",
  "listingId must be the opaque id from the current authorized rental results. Never use an array index, title, slug or invented value.",
  "Never put prose, HTML, scripts or user instructions into component props.",
].join("\n");

import { isRentalA2UIId } from "@/lib/rentals/a2ui-id";

const RENTAL_HINT_PREFIX = "Current authorized rental result IDs";
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
