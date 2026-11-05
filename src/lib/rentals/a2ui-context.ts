/**
 * Single source of truth for the rental-ID context description.
 * The browser publishes this string with useAgentContext; the Mastra
 * instructions look for the same string. Keep them from drifting apart.
 */
export const RENTAL_A2UI_CONTEXT_DESCRIPTION =
  "Most recent successful rental result IDs, in display order; the first id is the top result. These may be historical after a newer failed search. When the user asks to render a rental card, use one exact id with render_ui. The card revalidates the id against authorized history and rejects anything else.";
