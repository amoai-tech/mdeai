import type { ProcessAPIErrorArgs } from "@mastra/core/processors";

/**
 * SAN-1396 — One tightly scoped recovery from Gemini generating an unparsable
 * function call. Mastra's default error processors still own network/429/5xx.
 *
 * A malformed call cannot execute a tool in its own model step. We retry only
 * the very first step of a turn, before any previous step/tool result exists.
 * Retrying a later step could repeat a booking or another committed action.
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
  }: Pick<ProcessAPIErrorArgs, "error" | "retryCount" | "stepNumber" | "steps">) {
    if (
      retryCount !== 0 ||
      stepNumber !== 0 ||
      steps.length !== 0 ||
      !isGeminiMalformedCall(error)
    ) {
      return;
    }
    return { retry: true };
  },
};
