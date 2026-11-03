/**
 * SAN-1507 — keep a signed-out visitor's unsent AI question across the trip to /login and back.
 *
 * Same-tab `sessionStorage` only: it dies with the tab, expires after 30 minutes, is read once and
 * removed, and is never put in a URL, a log or the database. The restored text is placed in the
 * composer for the visitor to edit; it is never sent automatically.
 */
const KEY = "mde.concierge.draft";
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_CHARS = 2000;

export function stashConciergeDraft(text: string, now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ text: text.slice(0, MAX_CHARS), at: now }));
  } catch {
    // Storage blocked (private window, quota): the question is still visible in the transcript.
  }
}

/** Returns the stashed question once, then forgets it. */
export function takeConciergeDraft(now: number = Date.now()): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return null;
    window.sessionStorage.removeItem(KEY);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { text, at } = parsed as { text?: unknown; at?: unknown };
    if (typeof text !== "string" || typeof at !== "number") return null;
    if (now - at > MAX_AGE_MS || text.trim() === "") return null;
    return text;
  } catch {
    return null;
  }
}
