/**
 * Columns of the rentals results grid, shared by the loaded page and its loading skeleton so the two
 * can never disagree. The results column is narrow beside the side menu and the map: a 1024 px window
 * leaves about 360 px, which fits one card, not two; two columns start at 1280 px.
 */
export const RENTAL_RESULTS_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2";
