/** One browser-tab thread per signed-in actor AND selected business. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionStore = Pick<Storage, "getItem" | "setItem">;

/**
 * Use an explicit CopilotKit v2 threadId for partner chat. The root discovery
 * conversation must never be replayed inside a different business workspace.
 * Storage is only a UX cache: server-side thread ownership/membership still
 * authorizes every request.
 */
export function getPartnerChatThreadId(
  storage: SessionStore | null,
  userId: string,
  partnerId: string,
  newId: () => string = () => crypto.randomUUID(),
): string {
  const key = `mde:partner-chat-thread:v1:${userId}:${partnerId}`;
  try {
    const existing = storage?.getItem(key);
    if (existing && UUID.test(existing)) return existing;
  } catch {
    // Private browsing/storage disabled: use a fresh in-memory thread.
  }

  const threadId = newId();
  if (!UUID.test(threadId)) throw new Error("Expected a UUID partner thread");
  try { storage?.setItem(key, threadId); } catch { /* Safe temporary thread. */ }
  return threadId;
}
