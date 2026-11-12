/**
 * CopilotKit's chat composer renders a textarea with only a placeholder. That
 * fails the "form field has no id or name" accessibility rule and gives form
 * autofill nothing to bind to, so add stable attributes without changing the
 * component or its behaviour.
 */
export const CONCIERGE_CHAT_INPUT_ID = "concierge-chat-input";

export function ensureConciergeChatInputAccessibility(root: ParentNode = document): boolean {
  const input = root.querySelector<HTMLTextAreaElement>('textarea[placeholder="Type a message..."]');
  if (!input) return false;
  if (!input.id) input.id = CONCIERGE_CHAT_INPUT_ID;
  if (!input.getAttribute("name")) input.setAttribute("name", "message");
  if (!input.getAttribute("aria-label")) input.setAttribute("aria-label", "Message the concierge");
  return true;
}
