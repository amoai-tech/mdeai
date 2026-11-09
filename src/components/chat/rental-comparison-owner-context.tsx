"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** Only one rental result in the chat can own the persistent Compare action. */
type ComparisonOwner = {
  activeId: string | null;
  activate: (id: string) => void;
  clear: (id: string) => void;
};

const RentalComparisonOwnerContext = createContext<ComparisonOwner | null>(null);

export function RentalComparisonOwnerProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activate = useCallback((id: string) => setActiveId(id), []);
  const clear = useCallback((id: string) =>
    setActiveId((current) => current === id ? null : current), []);
  const value = useMemo(() => ({ activeId, activate, clear }), [activeId, activate, clear]);
  return (
    <RentalComparisonOwnerContext.Provider value={value}>
      {children}
    </RentalComparisonOwnerContext.Provider>
  );
}

/** Null outside the chat: isolated tool-render and unit-test fallbacks still work. */
export function useRentalComparisonOwner() {
  return useContext(RentalComparisonOwnerContext);
}
