/**
 * Host Ops thread selection only; messages remain in canonical Mastra Postgres.
 * The server checks the stored resourceId on every CopilotKit request, so a
 * browser-stored threadId never grants authority to another user's history.
 */
export type HostThreadSelection = {
  userId: string;
  threadId: string;
  restored: boolean;
};

const KEY_PREFIX = "mde:host-ops:thread:v1:";
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function selectHostThread(
  userId: string,
  storage: Pick<Storage, "getItem" | "setItem"> | (() => Pick<Storage, "getItem" | "setItem">),
  mint: () => string,
): HostThreadSelection {
  const key = `${KEY_PREFIX}${userId}`;
  try {
    // Browser policy can throw while obtaining window.sessionStorage itself,
    // before getItem()/setItem() are reached.
    const store = typeof storage === "function" ? storage() : storage;
    const saved = store.getItem(key);
    if (saved && UUID.test(saved)) {
      return { userId, threadId: saved, restored: true };
    }
    const threadId = mint();
    store.setItem(key, threadId);
    return { userId, threadId, restored: false };
  } catch {
    // Disabled/blocked browser storage must not prevent access to the host UI.
    // Continuity is unavailable in this case; server ownership still applies.
    return { userId, threadId: mint(), restored: false };
  }
}
