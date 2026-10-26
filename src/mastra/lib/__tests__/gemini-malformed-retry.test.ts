import { describe, expect, it } from "vitest";
import { geminiMalformedFirstStepRetry } from "../gemini-malformed-retry";

const malformed = {
  code: "AGENT_STREAM_ERROR",
  details: { rawFinishReason: "MALFORMED_FUNCTION_CALL" },
  message: 'Agent stream finished with finishReason "error" (provider reported "MALFORMED_FUNCTION_CALL")',
};

const firstStep = { error: malformed, retryCount: 0, stepNumber: 0, steps: [] };

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

  it("recognizes the exact provider finish reason in a wrapped error cause", () => {
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep,
      error: { code: "STREAM_WRAPPER", cause: malformed },
    })).toEqual({ retry: true });
  });
});
