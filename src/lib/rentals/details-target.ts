import type { Rental } from "@/mastra/tools/search-rentals";

/**
 * Which apartment the renter means when they say "show me the details".
 *
 * The agent can pass the listing id it already saw in the tool result, or a 1-based position
 * ("the first one"). Only an apartment that is already on the page may be opened: an unknown id
 * is refused rather than silently replaced with a different listing.
 */
export function resolveRentalForDetails(
  results: readonly Rental[],
  target: { listingId?: string; index?: number } = {},
): Rental | null {
  if (results.length === 0) return null;

  const rawId = target.listingId?.trim();
  if (rawId) {
    const withoutPinPrefix = rawId.startsWith("rental-") ? rawId.slice("rental-".length) : rawId;
    return results.find((rental) => rental.id === rawId || rental.id === withoutPinPrefix) ?? null;
  }

  const requested = target.index;
  const position = requested === undefined ? 1 : requested;
  // A position the page does not have is a model mistake, not permission to open a different
  // apartment. Refuse it; the tool tells the renter there is no such result.
  if (!Number.isInteger(position) || position < 1 || position > results.length) return null;
  return results[position - 1] ?? null;
}
