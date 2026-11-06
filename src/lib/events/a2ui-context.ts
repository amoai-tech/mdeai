/** One contract shared by the browser context and the Mastra instruction reader. */
export const EVENT_A2UI_CONTEXT_DESCRIPTION =
  "Most recent successful event result IDs, in display order; the first id is the top result. These may be historical after a newer failed search. When the user asks to render an event card, use one exact id with render_ui. The card revalidates the id against authorized history and rejects anything else.";
