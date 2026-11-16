/**
 * Single source of truth for the rental-ID context description.
 * The browser publishes this string with useAgentContext; the Mastra
 * instructions look for the same string. Keep them from drifting apart.
 */
/**
 * How many result IDs the browser publishes and the server accepts. The Rentals page can
 * render up to 100 apartments, but a renter asks for the early ones ("show the sixth"); a
 * cap of 5 made even those unreachable, so the model silently showed the last apartment
 * it knew. Later positions are not published: the hint text says so instead of claiming
 * the apartment is absent.
 */
export const RENTAL_HINT_MAX = 10;

export const RENTAL_A2UI_CONTEXT_DESCRIPTION =
  "Most recent successful rental result IDs, in display order; the first id is the top result. These may be historical after a newer failed search. When the user asks to render a rental card, use one exact id with render_ui. The card revalidates the id against authorized history and rejects anything else.";
