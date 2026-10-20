import { mapSavedThreadRow, type SavedThreadMessageRow } from "@/lib/chat/saved-thread-history";

/**
 * SAN-1412 — what counts as a real chat title, and how one is made.
 *
 * Pure and deterministic on purpose: no model call, so the same first message always gives the same
 * title, it costs nothing, and the tests need no mocks. Shared by the sidebar label, the PATCH route
 * and the tests, so there is exactly one rule.
 */

/** Mastra's default title for a thread that was never named. */
const PLACEHOLDER_TITLE = "Untitled Thread";

/** The longest title the sidebar shows, ellipsis included. */
export const MAX_THREAD_TITLE_CHARS = 60;

/** Below this many characters a word-boundary cut is not worth it; cut hard instead. */
const MIN_WORD_BOUNDARY_CHARS = 20;

const ELLIPSIS = "…";

/** True for a title worth showing: a nonblank string that is not the placeholder. */
export function isMeaningfulThreadTitle(title: unknown): title is string {
  if (typeof title !== "string") return false;
  const trimmed = title.trim();
  return trimmed !== "" && trimmed !== PLACEHOLDER_TITLE;
}

/**
 * A title of at most 60 characters from a user's message: whitespace collapsed, cut at a word when it
 * is too long, with exactly one ellipsis. `null` when the message has no useful text.
 */
export function deriveThreadTitle(userText: string): string | null {
  const text = userText.replace(/\s+/g, " ").trim();
  if (text === "") return null;
  if (text.length <= MAX_THREAD_TITLE_CHARS) return text;

  const room = MAX_THREAD_TITLE_CHARS - ELLIPSIS.length;
  const head = text.slice(0, room);
  const lastSpace = head.lastIndexOf(" ");
  // Cut at the last whole word when there is a sensible one; a single huge word is cut hard.
  const stem = lastSpace >= MIN_WORD_BOUNDARY_CHARS ? head.slice(0, lastSpace) : head;
  return `${stem.trimEnd()}${ELLIPSIS}`;
}

/**
 * The title for a saved chat, taken from its EARLIEST useful user message. `rows` are stored message
 * rows, oldest first. Assistant, tool and unreadable rows are never used.
 */
export function deriveTitleFromStoredMessages(rows: SavedThreadMessageRow[]): string | null {
  for (const row of rows) {
    for (const message of mapSavedThreadRow(row) ?? []) {
      if (message.role !== "user") continue;
      const title = deriveThreadTitle(message.content);
      if (title !== null) return title;
    }
  }
  return null;
}
