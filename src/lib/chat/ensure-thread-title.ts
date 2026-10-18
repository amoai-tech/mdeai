import { notifyThreadListChanged } from "@/lib/chat/thread-list-events";

/**
 * SAN-1412 — ask the server to make sure a saved chat has a real title, then tell the sidebar.
 *
 * Best effort and fail-soft: it never throws, so a title problem can never break a chat turn or
 * the opening of a saved chat. The body is empty on purpose; the server derives the title from the
 * chat's own stored first message, so the browser cannot name anyone's chat.
 *
 * Returns true when the server answered success (even if nothing needed changing).
 */

// A signed-out visitor has no saved chats: after one 401, stop asking until the page reloads (signing
// in navigates, which resets this), so a guest's chat makes one request, not one per message.
let signedOut = false;

export async function ensureThreadTitle(threadId: string): Promise<boolean> {
  if (signedOut) return false;
  try {
    const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}`, { method: "PATCH" });
    if (response.status === 401) {
      signedOut = true;
      return false;
    }
    if (!response.ok) return false;
    // Titled or not, the chat just had activity and moves to the top of the list.
    notifyThreadListChanged();
    return true;
  } catch {
    return false;
  }
}
