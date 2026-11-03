/**
 * SAN-1412 — one small browser signal: "the saved-chat list changed".
 *
 * A chat got a title, or moved to the top because it just had a new message. The sidebar subscribes
 * and refetches; nothing polls and no global store is involved. Server-safe: with no `window` it
 * does nothing.
 */

const EVENT_NAME = "mdeai:thread-list-changed";

export function notifyThreadListChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT_NAME));
}

/** Listen for list changes. Returns the function that stops listening. */
export function subscribeThreadListChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
