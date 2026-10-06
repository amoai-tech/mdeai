/**
 * What the chat sidebar shows for a saved chat.
 *
 * The server sends the stored title only when it is meaningful (`normalizeThreadTitle`);
 * the browser builds the fallback from the last-activity date so the time reads in the
 * viewer's own time zone (the server runs in UTC, Medellín is UTC-5).
 */

/** A stored title when it is a nonblank string; otherwise `null` (never the text "null"). */
export function normalizeThreadTitle(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

/** The stored title, or `Chat · Oct 2, 4:32 PM` from `updatedAt`, or `Chat` if the date is unusable. */
export function threadLabel(title: string | null, updatedAt: string, locale?: string): string {
  if (title !== null) return title;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "Chat";
  const when = date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Chat · ${when}`;
}
