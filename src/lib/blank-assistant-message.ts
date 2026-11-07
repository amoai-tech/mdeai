/**
 * B2 · a rendered assistant message with no text is a FAILED turn, not an answer.
 *
 * The intermittent symptom is a `200` whose stream produced a message bubble with
 * nothing in it. Nothing in the runtime treats that as an error, so the customer sees a
 * blank reply and no Retry. This helper is the single place that decides "this message
 * carries no answer", so the provider can surface the existing retryable notice.
 *
 * It reads only the message shape; it never inspects or stores conversation content.
 */
interface TextPart {
  type?: string;
  text?: string;
}

interface AssistantLike {
  role?: string;
  content?: unknown;
  /**
   * AG-UI assistant tool-call message shape:
   * `{ role: "assistant", content: "", toolCalls: [...] }` — valid work with no prose.
   */
  toolCalls?: unknown[];
}

/** Text carried by a message, however the runtime encoded it. */
export function messageText(message: AssistantLike): string {
  const { content } = message;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const candidate = part as TextPart | null;
        return candidate?.type === "text" && typeof candidate.text === "string"
          ? candidate.text
          : "";
      })
      .join("");
  }
  if (content && typeof content === "object") {
    const single = content as TextPart;
    return typeof single.text === "string" ? single.text : "";
  }
  return "";
}

/**
 * True only for a finished assistant message that renders nothing.
 *
 * Not failures, and deliberately excluded:
 * - user messages;
 * - tool results carried in `content` parts;
 * - AG-UI assistant tool-call messages (`content: ""` + non-empty `toolCalls`). A run
 *   that ends on a browser tool (`focusMapPin`) or an approval request has done real
 *   work and must not show an error notice.
 */
export function isBlankAssistantMessage(message: AssistantLike | undefined): boolean {
  if (!message || message.role !== "assistant") return false;
  if (messageText(message).trim().length > 0) return false;
  // AG-UI tool-call message: empty text, real work.
  if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) return false;
  // A message that carries only tool parts produced no prose, but it did produce work.
  if (Array.isArray(message.content)) {
    const hasNonTextPart = message.content.some((part) => {
      const candidate = part as TextPart | null;
      return Boolean(candidate?.type) && candidate?.type !== "text";
    });
    if (hasNonTextPart) return false;
  }
  return true;
}

/** Per-thread memory of blank messages already reported. */
export interface BlankReportLedger {
  threadId: string;
  ids: Set<string>;
}

/**
 * True the first time this blank message is seen for this thread, false afterwards.
 *
 * The provider effect re-runs on every message-count change, so a `Set` created inside
 * it would forget and re-report the same turn, pushing the retryable notice again and
 * again. The caller keeps the ledger across re-runs and resets it only when the thread
 * changes.
 */
export function shouldReportBlankOnce(
  ledger: BlankReportLedger,
  messageId: string,
): boolean {
  if (ledger.ids.has(messageId)) return false;
  ledger.ids.add(messageId);
  return true;
}
