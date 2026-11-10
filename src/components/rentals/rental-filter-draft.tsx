"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
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
  /** Inline reason the last Apply was refused (stale value, duplicate click). */
  applyError: string | null;
  setApplyError: (error: string | null) => void;
};

const DraftContext = createContext<DraftContextValue | null>(null);

/**
 * The AI surface and the page do not always share one React root, so the draft
 * lives in a tiny external store both can read. A remount of either tree keeps
 * the renter's edit; only a new URL value reseeds it while it is unedited.
 */
type DraftState = { beds: string | null; edited: boolean; applyError: string | null; seededFrom: string | null };
let draftStore: DraftState = { beds: null, edited: false, applyError: null, seededFrom: null };
const draftListeners = new Set<() => void>();
function emitDraft() { for (const listener of draftListeners) listener(); }
function subscribeDraft(listener: () => void) {
  draftListeners.add(listener);
  return () => { draftListeners.delete(listener); };
}
function getDraftSnapshot() { return draftStore; }

/** Test/debug access to the shared draft. */
export function getRentalFilterDraftSnapshot() { return draftStore; }

export function resetRentalFilterDraft(initialBeds: string | null) {
  if (draftStore.edited && draftStore.seededFrom === initialBeds) return;
  draftStore = { beds: initialBeds, edited: false, applyError: null, seededFrom: initialBeds };
  emitDraft();
}

export function setRentalFilterDraftBeds(beds: string | null) {
  draftStore = { ...draftStore, beds, edited: true, applyError: null };
  emitDraft();
}

export function setRentalFilterDraftError(applyError: string | null) {
  draftStore = { ...draftStore, applyError };
  emitDraft();
}

/** Read the draft from any render root, provider or not. */
export function useRentalFilterStore() {
  const snapshot = useSyncExternalStore(subscribeDraft, getDraftSnapshot, getDraftSnapshot);
  return {
    draft: { beds: snapshot.beds },
    setBeds: setRentalFilterDraftBeds,
    edited: snapshot.edited,
    applyError: snapshot.applyError,
    setApplyError: setRentalFilterDraftError,
  };
}

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
  const snapshot = useSyncExternalStore(subscribeDraft, getDraftSnapshot, getDraftSnapshot);
  const { edited, applyError } = snapshot;
  // Seed from the URL once per mount; an existing edit survives a remount.
  useEffect(() => {
    resetRentalFilterDraft(initialBeds);
  }, [initialBeds]);
  const draftRef = useRef<RentalFilterDraft>({ beds: snapshot.beds });
  useEffect(() => {
    draftRef.current = { beds: snapshot.beds };
  }, [snapshot.beds]);
  const setBeds = useCallback((next: string | null) => {
    draftRef.current = { beds: next };
    setRentalFilterDraftBeds(next);
  }, []);
  const value = useMemo(
    () => ({
      draft: { beds: snapshot.beds },
      setBeds,
      draftRef,
      edited,
      applyError,
      setApplyError: setRentalFilterDraftError,
    }),
    [snapshot.beds, setBeds, edited, applyError],
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

/** A select's empty/whitespace value means "Any", never a real bedroom count. */
export function normalizeBedSelection(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function isRentalBedValue(value: string | null): boolean {
  return value === null || NATIVE_BED_VALUES.has(value);
}
