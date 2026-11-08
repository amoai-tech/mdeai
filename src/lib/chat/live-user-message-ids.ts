/**
 * Ephemeral send-origin proof for the shared CopilotKit agent. Reconnect and history replay
 * also add user-role messages; only an actual locally submitted message may be saved while
 * the owner-checked history GET is still pending. Weak keys follow the agent lifetime.
 */
const sent = new WeakMap<object, Set<string>>();
const key = (threadId: string, messageId: string) => `${threadId}:${messageId}`;

export function markLiveUserMessage(agent: object, threadId: string, messageId: string): void {
  const ids = sent.get(agent) ?? new Set<string>();
  ids.add(key(threadId, messageId));
  sent.set(agent, ids);
}

export function isLiveUserMessage(agent: object, threadId: string, messageId: string): boolean {
  return sent.get(agent)?.has(key(threadId, messageId)) ?? false;
}

export function clearLiveUserMessage(agent: object, threadId: string, messageId: string): void {
  sent.get(agent)?.delete(key(threadId, messageId));
}
