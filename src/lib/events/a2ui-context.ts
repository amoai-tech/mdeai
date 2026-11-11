/** One contract shared by the browser context and the Mastra instruction reader. */
export const EVENT_A2UI_CONTEXT_DESCRIPTION =
  "Current active event search result IDs, in display order; the first id is the top result. No IDs are advertised after a failed search or a switch to another discovery category. Existing cards still resolve from authorized thread history. When the user asks to render an event card, use one exact id with render_ui. The card revalidates the id against authorized history and rejects anything else.";
