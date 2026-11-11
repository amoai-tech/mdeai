"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useEffect } from "react";
import type { MapPinCategory } from "@/platform/contracts";
import {
  shouldSuppressGenericMapResults,
  type RichCardCounts,
} from "@/platform/copilot/rich-card-results";

type RichCardResultsContextValue = {
  counts: RichCardCounts;
  setRichCardCount: (category: MapPinCategory, count: number) => void;
  clearRichCardCounts: () => void;
  groundedShownIds: readonly string[];
  setGroundedShownIds: (ids: readonly string[], onlyIfCurrentKey?: string) => void;
  hasRichCards: (category: MapPinCategory | null) => boolean;
  shouldSuppressGenericMapResults: (activeMapCategory: MapPinCategory | null) => boolean;
};

const RichCardResultsContext = createContext<RichCardResultsContextValue | null>(
  null,
);

export function RichCardResultsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<RichCardCounts>({});
  const [groundedShown, setGroundedShown] = useState<{ key: string; ids: readonly string[] }>({
    key: "", ids: [],
  });
  const setGroundedShownIds = useCallback((ids: readonly string[], onlyIfCurrentKey?: string) => {
    const key = ids.join("|");
    setGroundedShown((prev) => {
      if (onlyIfCurrentKey !== undefined && prev.key !== onlyIfCurrentKey) return prev;
      return prev.key === key ? prev : { key, ids: [...ids] };
    });
  }, []);

  const setRichCardCount = useCallback(
    (category: MapPinCategory, count: number) => {
      setCounts((prev) => {
        if (count <= 0) {
          if (prev[category] == null) return prev;
          const next = { ...prev };
          delete next[category];
          return next;
        }
        if (prev[category] === count) return prev;
        return { ...prev, [category]: count };
      });
    },
    [],
  );

  const clearRichCardCounts = useCallback(() => {
    setCounts({});
    setGroundedShown({ key: "", ids: [] });
  }, []);

  const hasRichCards = useCallback(
    (category: MapPinCategory | null) => {
      if (!category) return false;
      return (counts[category] ?? 0) > 0;
    },
    [counts],
  );

  const suppressGenericMapResults = useCallback(
    (activeMapCategory: MapPinCategory | null) =>
      shouldSuppressGenericMapResults(counts, activeMapCategory),
    [counts],
  );

  const value = useMemo(
    () => ({
      counts,
      setRichCardCount,
      clearRichCardCounts,
      groundedShownIds: groundedShown.ids,
      setGroundedShownIds,
      hasRichCards,
      shouldSuppressGenericMapResults: suppressGenericMapResults,
    }),
    [
      counts,
      setRichCardCount,
      clearRichCardCounts,
      groundedShown.ids,
      setGroundedShownIds,
      hasRichCards,
      suppressGenericMapResults,
    ],
  );

  return (
    <RichCardResultsContext.Provider value={value}>
      {children}
    </RichCardResultsContext.Provider>
  );
}

/** Optional for isolated tool renderers that are mounted outside the chat shell. */
export function useOptionalRichCardResults() {
  return useContext(RichCardResultsContext);
}

export function useRichCardResults() {
  const ctx = useContext(RichCardResultsContext);
  if (!ctx) {
    throw new Error(
      "useRichCardResults must be used within RichCardResultsProvider",
    );
  }
  return ctx;
}

/** Tool render components register card counts so generic lists stay suppressed. */
export function useRegisterRichCardResults(
  category: MapPinCategory,
  count: number,
) {
  const { setRichCardCount } = useRichCardResults();
  useEffect(() => {
    setRichCardCount(category, count);
    return () => setRichCardCount(category, 0);
  }, [category, count, setRichCardCount]);
}

export function RichCardResultsRegistrar({
  category,
  count,
}: {
  category: MapPinCategory;
  count: number;
}) {
  useRegisterRichCardResults(category, count);
  return null;
}
