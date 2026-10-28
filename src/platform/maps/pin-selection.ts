/**
 * One rule for every browse map: clicking the card or pin that is already selected clears the
 * selection; clicking a different one selects it.
 *
 * Kept pure so the three browse views (cafés, nightlife, restaurants) cannot drift apart, and so
 * the toggle is testable without mounting a map.
 */
export function nextPinSelection(
  currentPinId: string | null,
  clickedPinId: string,
): string | null {
  return currentPinId === clickedPinId ? null : clickedPinId;
}
