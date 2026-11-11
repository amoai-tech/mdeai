"use client";

import { useSyncExternalStore } from "react";

const LG_QUERY = "(min-width: 1024px)";

// `matchMedia` is absent in SSR and in jsdom component tests. Fall back to the same
// mobile-first answer `getServerSnapshot` gives instead of throwing, so a view that
// renders Details in this column can still be unit-tested.
/** Whether this environment can answer a media query at all. */
function canMatchMedia() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

/** Nothing to unsubscribe from when the environment has no matchMedia. */
function noopCleanup() {
  return undefined;
}

/** Subscribe to the lg breakpoint; nothing to observe without matchMedia. */
function subscribe(onStoreChange: () => void) {
  if (!canMatchMedia()) return noopCleanup;
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/** Current answer for the lg breakpoint, mobile-first when it cannot be queried. */
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
