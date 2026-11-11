"use client";

import { createContext, useContext } from "react";

/**
 * SAN-1653 — lets a generated EventCard open the same Details panel the browsed
 * grid opens. The Events page owns the selection state, so it publishes a single
 * `openEventDetail` callback instead of the catalog card reaching into page state
 * or a rental-specific context.
 */
export type EventBrowseSelection = {
  openEventDetail: (id: string) => boolean;
};

const EventBrowseSelectionContext = createContext<EventBrowseSelection | null>(null);

export function EventBrowseSelectionProvider({
  value,
  children,
}: {
  value: EventBrowseSelection;
  children: React.ReactNode;
}) {
  return (
    <EventBrowseSelectionContext.Provider value={value}>
      {children}
    </EventBrowseSelectionContext.Provider>
  );
}

export function useOptionalEventBrowseSelection(): EventBrowseSelection | null {
  return useContext(EventBrowseSelectionContext);
}

/**
 * SAN-1653 — a generated card can be re-mounted by the generative-UI activity
 * boundary, which may not preserve this React context. A module-level opener is
 * the same single action without depending on the render tree; the Events page
 * registers it while mounted and clears it on unmount.
 */
let registeredOpener: ((id: string) => void) | null = null;

export function registerEventDetailsOpener(opener: ((id: string) => void) | null): void {
  registeredOpener = opener;
}

export function openEventDetailsFromCard(id: string): boolean {
  if (!registeredOpener) return false;
  registeredOpener(id);
  return true;
}
