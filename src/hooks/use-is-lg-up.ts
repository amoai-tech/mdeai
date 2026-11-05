"use client";

import { useSyncExternalStore } from "react";

const LG_QUERY = "(min-width: 1024px)";

// `matchMedia` is absent in SSR and in jsdom component tests. Fall back to the same
// mobile-first answer `getServerSnapshot` gives instead of throwing, so a view that
// renders Details in this column can still be unit-tested.
function canMatchMedia() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onStoreChange: () => void) {
  if (!canMatchMedia()) return () => {};
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  if (!canMatchMedia()) return false;
  return window.matchMedia(LG_QUERY).matches;
}

/** SSR / first paint: mobile-first so we never mount two ChatMaps during hydrate. */
function getServerSnapshot() {
  return false;
}

/** Tailwind `lg` breakpoint — desktop map column vs mobile sheet. */
export function useIsLgUp() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
