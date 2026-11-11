/**
 * The A2UI matrix only certifies a real user journey when a requested source
 * event ID is present in the rendered cards and in the opened Details panel.
 * A card and a panel agreeing with each other is insufficient: both can be
 * the wrong event, especially when the requested ordinal is out of range.
 */
export function isMatchingEventDetails({ requestedSourceId, renderedCardIds, openedDetailsId }) {
  return typeof requestedSourceId === 'string' &&
    requestedSourceId.length > 0 &&
    Array.isArray(renderedCardIds) &&
    renderedCardIds.includes(requestedSourceId) &&
    openedDetailsId === requestedSourceId;
}

/** Reject an empty QA selection; otherwise a typo silently prints 0 pass, 0 fail. */
export function selectMatrixCases({ suite, only, rentals, events }) {
  if (!['all', 'rentals', 'events'].includes(suite)) {
    throw new Error(`Unknown QA suite: ${suite}`);
  }
  const wantedRentals = suite === 'all' || suite === 'rentals' ? rentals : [];
  const wantedEvents = suite === 'all' || suite === 'events' ? events : [];
  const selected = {
    rentals: only ? wantedRentals.filter((c) => c.id === only) : wantedRentals,
    events: only ? wantedEvents.filter((c) => c.id === only) : wantedEvents,
  };
  if (selected.rentals.length + selected.events.length === 0) {
    throw new Error(`Unknown QA case: ${only || '(none)'}`);
  }
  return selected;
}
