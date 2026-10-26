import type { ProcessAPIErrorArgs } from "@mastra/core/processors";
import { describe, expect, it } from "vitest";
import { geminiMalformedFirstStepRetry } from "../gemini-malformed-retry";

function messageList(activeParts: string[] = [], previousParts: string[] = []) {
  return {
    get: { all: { db: () => [
      { id: "older", role: "assistant", content: { parts: previousParts.map((type) => ({ type })) } },
      { id: "active", role: "assistant", content: { parts: activeParts.map((type) => ({ type })) } },
    ] } },
  } as unknown as ProcessAPIErrorArgs["messageList"];
}

const malformed = {
  code: "AGENT_STREAM_ERROR",
  details: { rawFinishReason: "MALFORMED_FUNCTION_CALL" },
  message: 'Agent stream finished with finishReason "error" (provider reported "MALFORMED_FUNCTION_CALL")',
};

const firstStep = {
  error: malformed,
  retryCount: 0,
  stepNumber: 0,
  steps: [],
  messageId: "active",
  messageList: messageList(),
};

describe("SAN-1396 Gemini malformed function-call recovery", () => {
  it("allows exactly one retry before any tool step completed", () => {
    expect(geminiMalformedFirstStepRetry.processAPIError(firstStep)).toEqual({ retry: true });
    expect(geminiMalformedFirstStepRetry.processAPIError({ ...firstStep, retryCount: 1 })).toBeUndefined();
  });

  it("never retries after a completed model/tool step or on later steps", () => {
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep,
      stepNumber: 1,
    })).toBeUndefined();
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep,
      steps: [{ stepType: "tool-result" }] as never,
    })).toBeUndefined();
  });

  it("does not retry unauthorized requests, quota errors, malformed inputs or an unrelated agent error", () => {
    for (const error of [
      { code: "AGENT_STREAM_ERROR", details: { rawFinishReason: "OTHER" } },
      { code: "UNAUTHORIZED", details: { rawFinishReason: "MALFORMED_FUNCTION_CALL" } },
      new Error("MALFORMED_FUNCTION_CALL"),
      { code: 401 },
      { code: 403 },
      { code: 429 },
      { code: "AGENT_STREAM_ERROR", details: { rawFinishReason: "MISSING_THOUGHT_SIGNATURE" } },
    ]) {
      expect(geminiMalformedFirstStepRetry.processAPIError({ ...firstStep, error })).toBeUndefined();
    }
  });

  it("refuses a retry when the current assistant message contains a tool invocation", () => {
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep, messageList: messageList(["tool-invocation"]),
    })).toBeUndefined();
  });

  it("does not confuse a tool call in earlier chat history with this first-step retry", () => {
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep, messageList: messageList([], ["tool-invocation"]),
    })).toEqual({ retry: true });
  });

  it("fails closed when the current assistant message cannot be identified", () => {
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep, messageId: undefined,
    })).toBeUndefined();
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep, messageList: undefined as never,
    })).toBeUndefined();
  });

  it("recognizes the exact provider finish reason in a wrapped error cause", () => {
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep,
      error: { code: "STREAM_WRAPPER", cause: malformed },
    })).toEqual({ retry: true });
  });
});
