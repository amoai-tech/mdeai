import type { ProcessAPIErrorArgs } from "@mastra/core/processors";

/**
 * SAN-1396 — One tightly scoped recovery from Gemini generating an unparsable
 * function call. Mastra's default error processors still own network/429/5xx.
 *
 * A malformed provider response can arrive AFTER a streamed tool call has
 * already executed, even with stepNumber=0 and no completed model steps.
 * We therefore inspect the active assistant message (not historical messages)
 * and never retry once this step has emitted a tool invocation. An absent
 * message ID / message list fails closed rather than risking a double write.
 */
function isGeminiMalformedCall(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth++) {
    if (!current || typeof current !== "object") return false;
    const value = current as {
      code?: unknown;
      details?: { rawFinishReason?: unknown };
      cause?: unknown;
    };
    if (
      value.code === "AGENT_STREAM_ERROR" &&
      value.details?.rawFinishReason === "MALFORMED_FUNCTION_CALL"
    ) {
      return true;
    }
    current = value.cause;
  }
  return false;
}

export const geminiMalformedFirstStepRetry = {
  id: "gemini-malformed-first-step-retry",
  name: "Retry Gemini malformed first-step function call once",
  processAPIError({
    error,
    retryCount,
    stepNumber,
    steps,
    messageId,
    messageList,
  }: Pick<ProcessAPIErrorArgs, "error" | "retryCount" | "stepNumber" | "steps" | "messageId" | "messageList">) {
    if (
      retryCount !== 0 ||
      stepNumber !== 0 ||
      steps.length !== 0 ||
      !isGeminiMalformedCall(error) ||
      !messageId ||
      !messageList
    ) {
      return;
    }

    // Mastra streams tool invocations into the assistant message before the
    // model step is complete. steps.length===0 alone cannot prove that no
    // tool has executed. Ignore invocations from previous turns in history.
    const activeMessage = messageList.get.all.db().find(
      (message) => message.id === messageId && message.role === "assistant",
    );
    if (
      activeMessage?.content.parts.some(
        (part) => part.type === "tool-invocation",
      )
    ) {
      return;
    }

    return { retry: true };
  },
};
