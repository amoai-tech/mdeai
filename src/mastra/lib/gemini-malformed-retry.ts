import type { ProcessAPIErrorArgs } from "@mastra/core/processors";
import { resolveAgentModelName } from "./mastra-telemetry";

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

/**
 * SAN-1396 monitoring — a recovered turn is stored as `success` in `ai_runs`, so
 * the recovery itself is only visible here. One structured line per decision:
 * agent, model, deployment SHA and outcome. Never message text or tool input.
 */
function logRecovery(
  outcome: "retry" | "refused_tool_ran" | "refused_unidentified_message",
  agent: ProcessAPIErrorArgs["agent"],
) {
  console.warn(
    JSON.stringify({
      event: "gemini_malformed_recovery",
      outcome,
      agent: agent?.id ?? "unknown",
      model: resolveAgentModelName(agent),
      sha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 10) ?? "local",
      ts: new Date().toISOString(),
    }),
  );
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
    agent,
  }: Pick<ProcessAPIErrorArgs, "error" | "retryCount" | "stepNumber" | "steps" | "messageId" | "messageList" | "agent">) {
    if (
      retryCount !== 0 ||
      stepNumber !== 0 ||
      steps.length !== 0 ||
      !isGeminiMalformedCall(error)
    ) {
      return;
    }
    if (!messageId || !messageList) {
      logRecovery("refused_unidentified_message", agent);
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
      logRecovery("refused_tool_ran", agent);
      return;
    }

    logRecovery("retry", agent);
    return { retry: true };
  },
};
