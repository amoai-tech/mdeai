/**
 * Saved-thread history (SAN-1389): persisted Mastra v2 messages → the
 * CopilotKit (AG-UI) messages a reopened chat renders.
 *
 * Mastra stores `content` as a JSON string shaped like
 * `{ format: 2, parts: [...], content?: string }`. Only what the chat UI needs
 * crosses this boundary: id, role, text, and completed tool calls (so
 * tool-rendered cards still show). Raw rows, metadata and provider data never do.
 *
 * Pure on purpose: it is shared by the API route and unit tests, and a row it
 * cannot read is skipped rather than failing the whole conversation.
 */

/** The most messages one reopen replays (MVP cap; no older-message UI yet). */
export const SAVED_THREAD_HISTORY_LIMIT = 100;

export type SavedThreadMessageRow = {
  id: unknown;
  role: unknown;
  content: unknown;
  createdAt?: unknown;
};

export type SavedThreadMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      toolCalls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { id: string; role: "tool"; toolCallId: string; content: string };

type Part = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseContent(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      return asRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return asRecord(raw);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

/** Map one stored row; `null` when it is not something the chat can show. */
export function mapSavedThreadRow(row: SavedThreadMessageRow): SavedThreadMessage[] | null {
  if (typeof row.id !== "string" || row.id.length === 0) return null;
  if (row.role !== "user" && row.role !== "assistant") return null;

  const content = parseContent(row.content);
  if (!content) return null;

  const parts: Part[] = Array.isArray(content.parts)
    ? content.parts.filter((p): p is Part => asRecord(p) !== null)
    : [];

  let text = parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
  // Older rows carry only the flat string.
  if (text.length === 0 && typeof content.content === "string") text = content.content;

  if (row.role === "user") {
    return text.trim().length > 0 ? [{ id: row.id, role: "user", content: text }] : null;
  }

  const calls = parts
    .map((p) => asRecord(p.toolInvocation))
    .filter(
      (t): t is Record<string, unknown> =>
        t !== null &&
        t.state === "result" &&
        typeof t.toolCallId === "string" &&
        typeof t.toolName === "string",
    );

  if (text.trim().length === 0 && calls.length === 0) return null;

  const assistant: SavedThreadMessage = {
    id: row.id,
    role: "assistant",
    content: text,
    ...(calls.length > 0
      ? {
          toolCalls: calls.map((t) => ({
            id: t.toolCallId as string,
            type: "function" as const,
            function: { name: t.toolName as string, arguments: stringify(t.args) },
          })),
        }
      : {}),
  };
  const results: SavedThreadMessage[] = calls.map((t) => ({
    id: `${row.id}:${t.toolCallId as string}`,
    role: "tool" as const,
    toolCallId: t.toolCallId as string,
    content: stringify(t.result),
  }));
  return [assistant, ...results];
}

/**
 * Newest-`limit` rows → chronological (oldest first) messages. Input order does
 * not matter: ordering is by `createdAt`, then id, so it is deterministic.
 */
export function mapSavedThreadHistory(
  rows: readonly SavedThreadMessageRow[],
  limit: number = SAVED_THREAD_HISTORY_LIMIT,
): SavedThreadMessage[] {
  const stamp = (r: SavedThreadMessageRow) => String(r.createdAt ?? "");
  const ordered = [...rows].sort(
    (a, b) => stamp(a).localeCompare(stamp(b)) || String(a.id).localeCompare(String(b.id)),
  );
  const newest = ordered.slice(-limit);

  const seen = new Set<string>();
  const out: SavedThreadMessage[] = [];
  for (const row of newest) {
    for (const message of mapSavedThreadRow(row) ?? []) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      out.push(message);
    }
  }
  return out;
}
