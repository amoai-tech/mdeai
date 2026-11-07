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
 * User messages, tool-only messages and messages still streaming are not failures, so
 * they return false: a tool result with no prose is a legitimate turn.
 */
export function isBlankAssistantMessage(message: AssistantLike | undefined): boolean {
  if (!message || message.role !== "assistant") return false;
  if (messageText(message).trim().length > 0) return false;
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
