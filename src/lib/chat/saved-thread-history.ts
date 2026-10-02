/**
 * Saved-thread history (SAN-1389): persisted Mastra v2 messages → the
 * CopilotKit (AG-UI) messages a reopened chat renders.
 *
 * Mastra stores `content` as a JSON string shaped like
 * `{ format: 2, parts: [...], content?: string }`. Only what the chat UI needs
 * crosses this boundary: id, role, text, and completed tool calls (so
 * tool-rendered cards still show). Raw rows, metadata and provider data never do.
 *
 * Deliberately NOT replayed: the custom `data-*` parts Mastra also stores
 * (`data-mdeai-actions`, `data-workspace-metadata`), reasoning, sources and
 * step markers. Nothing in the current client reads `data-mdeai-actions`; result
 * cards are drawn from tool calls (`useRenderTool`, keyed by tool name), which
 * ARE replayed. A reopened chat therefore restores the conversation and its
 * tool-result cards, not transient workspace metadata.
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
  const mapped: SavedThreadMessage[] = [];
  const writtenAt: number[] = [];
  for (const row of newest) {
    const at = Date.parse(String(row.createdAt ?? ""));
    for (const message of mapSavedThreadRow(row) ?? []) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      mapped.push(message);
      writtenAt.push(at);
    }
  }
  return dropRepeatedTurns(mapped, writtenAt);
}

/**
 * Two messages written within this window were saved in one batch. Measured on a
 * pre-fix preview: re-saved copies were written 1-3 ms apart, while a genuine
 * question and its answer were 1.6-1.9 s apart (the model's latency).
 */
const SAME_BATCH_MS = 500;

/** What makes two stored messages "the same message", ignoring their ids. */
function messageKey(m: SavedThreadMessage): string {
  if (m.role === "tool") return `tool\u0000${m.content}`;
  const calls =
    m.role === "assistant" && m.toolCalls
      ? m.toolCalls.map((c) => `${c.function.name}(${c.function.arguments})`).join("|")
      : "";
  return `${m.role}\u0000${m.content}\u0000${calls}`;
}

/**
 * Hide turns that were saved more than once (legacy rows; nothing is deleted).
 *
 * Before SAN-1389 each message re-saved the whole earlier conversation under new
 * ids, so a chat reads q1 a1 q1 a1 q2 a2. A message is a repeat when an earlier
 * one has the same role and text, AND its neighbour on one side matches the
 * earlier one's neighbour, AND the two neighbours were written in the same batch
 * (within `SAME_BATCH_MS`). The batch test is what separates a re-saved copy from
 * a person who really asks the same thing twice and gets the same answer: those
 * are seconds apart. A write time that cannot be read counts as "not the same
 * batch", so the message is kept. A tool result whose assistant message was
 * dropped goes with it.
 */
function dropRepeatedTurns(
  messages: SavedThreadMessage[],
  writtenAt: readonly number[],
): SavedThreadMessage[] {
  const keys = messages.map(messageKey);
  const sameBatch = (a: number, b: number) => Math.abs(writtenAt[a] - writtenAt[b]) <= SAME_BATCH_MS;
  const seenAt = new Map<string, number[]>();
  const keep = messages.map((_, i) => {
    const earlier = seenAt.get(keys[i]) ?? [];
    const repeat = earlier.some(
      (j) =>
        (i > 0 && j > 0 && keys[i - 1] === keys[j - 1] && sameBatch(i, i - 1)) ||
        (i < keys.length - 1 && j < keys.length - 1 && keys[i + 1] === keys[j + 1] && sameBatch(i, i + 1)),
    );
    seenAt.set(keys[i], [...earlier, i]);
    return !repeat;
  });

  const kept = messages.filter((_, i) => keep[i]);
  const liveCalls = new Set(
    kept.flatMap((m) => (m.role === "assistant" && m.toolCalls ? m.toolCalls.map((c) => c.id) : [])),
  );
  return kept.filter((m) => m.role !== "tool" || liveCalls.has(m.toolCallId));
}

type LiveMessage = { id: string; role: string; content?: unknown; toolCalls?: unknown; toolCallId?: unknown };

/** Tool call ids a live assistant message makes, if any. */
function liveToolCallIds(m: LiveMessage): string[] {
  if (!Array.isArray(m.toolCalls)) return [];
  return m.toolCalls.flatMap((c) =>
    c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" ? [(c as { id: string }).id] : [],
  );
}

/**
 * Merge what CopilotKit already holds for this thread into the durable history.
 *
 * The database history is the authoritative base. A warm CopilotKit replay can
 * be PARTIAL (only the last turns), so it must never decide that history is
 * complete. A live message is kept only if it adds something the durable
 * history does not have. The same turn can reach us under a different id from
 * each side, so a live message is a duplicate when its id is known, or:
 *  - user/assistant text: a durable message of the same role has the same text;
 *  - a tool call or tool result: its tool call id is one the durable history
 *    already has (tool call ids come from the model and are the same on both sides).
 * Kept extras come after the durable messages, in live order.
 *
 * Called once, at install time, when every live message is a replay of the
 * past, so a repeated "yes" is never dropped for being new.
 */
export function reconcileSavedHistory<T extends LiveMessage>(
  persisted: readonly SavedThreadMessage[],
  live: readonly T[],
): Array<SavedThreadMessage | T> {
  const ids = new Set(persisted.map((m) => m.id));
  const callIds = new Set(
    persisted.flatMap((m) => (m.role === "assistant" && m.toolCalls ? m.toolCalls.map((c) => c.id) : [])),
  );
  const turns = new Set(
    persisted.flatMap((m) =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content
        ? [`${m.role}\u0000${m.content}`]
        : [],
    ),
  );
  const extras = live.filter((m) => {
    if (ids.has(m.id)) return false;
    if (m.role === "tool") return !(typeof m.toolCallId === "string" && callIds.has(m.toolCallId));
    const calls = liveToolCallIds(m);
    if (calls.length > 0 && calls.some((id) => callIds.has(id))) return false;
    if (typeof m.content === "string" && m.content && turns.has(`${m.role}\u0000${m.content}`)) return false;
    return true;
  });
  return [...persisted, ...extras];
}
