"use client";

/**
 * One page-level way to open the shared Ask MDE assistant.
 *
 * The assistant is mounted once in the root layout, next to the phone tab bar, so a
 * page can ask it to open without wrapping the tree in another provider or holding
 * a second copy of chat state. Keep this tiny: it is a doorbell, not a store.
 */
export const ASK_MDE_OPEN_EVENT = "mde:ask-mde:open";

export function openAskMde(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ASK_MDE_OPEN_EVENT));
}
