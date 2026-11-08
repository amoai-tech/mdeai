/**
 * Ephemeral origin proof for user questions. SDK reconnect also adds user-role messages; only
 * actual UI submissions may be written while the owner-checked history request is pending.
 * Nothing here stores chat history or bypasses server-side ownership checks.
 */
type Message = { id: string; role: string; content?: unknown };
type Pending = { text: string; existingIds: Set<string> };
const sent = new WeakMap<object, Set<string>>();
const pending = new WeakMap<object, Map<string, Set<Pending>>>();
const key = (threadId: string, messageId: string) => `${threadId}:${messageId}`;

export function markLiveUserMessage(agent: object, threadId: string, messageId: string): void {
  const ids = sent.get(agent) ?? new Set<string>();
  ids.add(key(threadId, messageId));
  sent.set(agent, ids);
}

function markMatching(agent: object, threadId: string, message: Message): boolean {
  if (sent.get(agent)?.has(key(threadId, message.id))) return true;
  if (message.role !== "user" || typeof message.content !== "string") return false;
  const turns = pending.get(agent)?.get(threadId);
  if (!turns) return false;
  for (const turn of turns) {
    if (turn.text === message.content && !turn.existingIds.has(message.id)) {
      markLiveUserMessage(agent, threadId, message.id);
      turns.delete(turn);
      return true;
    }
  }
  return false;
}

/** Wrap the native CopilotChat submit; do not replace its send/stop/retry pipeline. */
export function beginLiveUserSubmit(
  agent: object & { messages: readonly Message[] }, threadId: string, text: string,
): () => void {
  const byThread = pending.get(agent) ?? new Map<string, Set<Pending>>();
  const turns = byThread.get(threadId) ?? new Set<Pending>();
  const turn = { text, existingIds: new Set(agent.messages.map((m) => m.id)) };
  turns.add(turn);
  byThread.set(threadId, turns);
  pending.set(agent, byThread);
  return () => {
    // A very fast native run can complete before React's effect sees the new message.
    // Claim its exact new ID now; the saver will observe the matching run-status change.
    for (const message of agent.messages) {
      if (message.role === "user" && message.content === turn.text &&
          !turn.existingIds.has(message.id)) {
        markLiveUserMessage(agent, threadId, message.id);
        break;
      }
    }
    turns.delete(turn);
    if (turns.size === 0) byThread.delete(threadId);
  };
}

export function isLiveUserMessage(
  agent: object, threadId: string, messageId: string, content?: unknown,
): boolean {
  return markMatching(agent, threadId, { id: messageId, role: "user", content });
}

export function clearLiveUserMessage(agent: object, threadId: string, messageId: string): void {
  sent.get(agent)?.delete(key(threadId, messageId));
}
