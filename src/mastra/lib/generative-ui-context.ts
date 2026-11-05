type AgUiContextEntry = {
  description?: unknown;
  value?: unknown;
};

const GENERATIVE_UI_GUIDE_PREFIX = "Generative UI guide:";

/**
 * The CopilotKit runtime puts the A2UI component guide in `RunAgentInput.context`
 * under `requestContext.get("ag-ui")`. Mastra's dynamic instructions are the
 * model-facing system prompt, so the guide must be appended there; merely
 * forwarding the context to a tool is not enough.
 */
export function readGenerativeUIGuide(agUiContext: unknown): string | null {
  if (!agUiContext || typeof agUiContext !== "object") return null;
  const entries = (agUiContext as { context?: unknown }).context;
  if (!Array.isArray(entries)) return null;
  const guides = entries
    .filter((entry): entry is AgUiContextEntry => Boolean(entry) && typeof entry === "object")
    .filter((entry) =>
      typeof entry.description === "string" &&
      entry.description.startsWith(GENERATIVE_UI_GUIDE_PREFIX))
    .map((entry) => (typeof entry.value === "string" ? entry.value.trim() : ""))
    .filter(Boolean);
  return guides.length > 0 ? guides.join("\n\n") : null;
}

/**
 * MDE's small catalog needs a concrete operation shape around the runtime's
 * generic guide. Without this, Gemini tends to invent a `div` wrapper and an
 * index instead of the real opaque listing id.
 */
export function withMdeA2UIContract(guide: string | null): string | null {
  if (!guide) return null;
  return [
    guide,
    "MDE A2UI contract:",
    "- The only catalog component is RentalCard.",
    '- Call render_ui with target "chat" and exactly one createSurface operation.',
    '- components must contain exactly one node: { id: "root", component: "RentalCard", listingId: "<id>" }.',
    '- Put listingId directly on that component. Do not use dataModel, children, slots or a second component.',
    "- Do not add a div, layout wrapper, children, cards, or any unknown component.",
    "- listingId must be the opaque id from lastRentalResults. Never use an array index, title, slug or invented value.",
  ].join("\n");
}
