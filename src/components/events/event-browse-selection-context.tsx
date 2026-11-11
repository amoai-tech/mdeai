"use client";

import { createContext, useContext } from "react";

/**
 * SAN-1653 — lets a generated EventCard open the same Details panel the browsed
 * grid opens. The Events page owns the selection state, so it publishes a single
 * `openEventDetail` callback instead of the catalog card reaching into page state
 * or a rental-specific context.
 */
export type EventBrowseSelection = {
  openEventDetail: (id: string) => void;
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
