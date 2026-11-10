"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type RentalFilterDraft = { beds: string | null };

type DraftContextValue = {
  draft: RentalFilterDraft;
  setBeds: (beds: string | null) => void;
  /** Latest value for event handlers, so a click never reads a stale render. */
  draftRef: { current: RentalFilterDraft };
  /** True once the renter changed the control; an AI update must not reset it. */
  edited: boolean;
};

const DraftContext = createContext<DraftContextValue | null>(null);

/**
 * SAN-1655 — the AI can show a filter control, but the draft belongs to the
 * page. It starts from the canonical URL value, changes only on a real user
 * gesture, and is never derived from a later agent response, so a new AI turn
 * cannot silently undo what the renter chose.
 */
export function RentalFilterDraftProvider({
  initialBeds,
  children,
}: {
  initialBeds: string | null;
  children: ReactNode;
}) {
  // `undefined` means "not edited yet", so the canonical URL value wins until a
  // real gesture. Deriving instead of syncing keeps the effect-free path safe.
  const [editedBeds, setEditedBeds] = useState<string | null | undefined>(undefined);
  const beds = editedBeds === undefined ? initialBeds : editedBeds;
  const edited = editedBeds !== undefined;
  const draftRef = useRef<RentalFilterDraft>({ beds });
  // Effects may write refs; they may not set state. This keeps the event
  // handler reading the latest value without a render-phase ref write.
  useEffect(() => {
    draftRef.current = { beds };
  }, [beds]);

  const setBeds = useCallback((next: string | null) => {
    draftRef.current = { beds: next };
    setEditedBeds(next);
  }, []);

  const value = useMemo(
    () => ({ draft: { beds }, setBeds, draftRef, edited }),
    [beds, setBeds, edited],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

/** Optional: catalog components also render outside the Rentals page. */
export function useOptionalRentalFilterDraft() {
  return useContext(DraftContext);
}

export function useRentalFilterDraft() {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useRentalFilterDraft must be used within RentalFilterDraftProvider");
  return ctx;
}

/**
 * The native filter's own values: `"0"` is Studio (`rental-browse-filters.tsx`).
 * Using a different token here would make Apply fail validation and would hide
 * the current selection on a page that loads with `?beds=0`.
 */
export const RENTAL_BED_OPTIONS = [
  { value: "", label: "Any" },
  { value: "0", label: "Studio" },
  { value: "1", label: "1 BR" },
  { value: "2", label: "2 BR" },
  { value: "3", label: "3 BR+" },
] as const;

const NATIVE_BED_VALUES = new Set(["0", "1", "2", "3"]);

export function isRentalBedValue(value: string | null): boolean {
  return value === null || NATIVE_BED_VALUES.has(value);
}
