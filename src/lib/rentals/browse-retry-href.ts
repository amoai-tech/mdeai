export type RentalRetryFilters = {
  neighborhood?: string | null;
  beds?: string | null;
};

/**
 * Where the browse error-state Retry button should send the user for the current
 * surface. A development preview must retry the preview, not the public browse.
 */
export function buildRetryHref(filters: RentalRetryFilters, previewMode = false): string {
  if (previewMode) return "/dev/rentals";
  const params = new URLSearchParams();
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.beds) params.set("beds", filters.beds);
  const query = params.toString();
  return query ? `/rentals?${query}` : "/rentals";
}
