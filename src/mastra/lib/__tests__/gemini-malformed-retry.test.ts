import type { ProcessAPIErrorArgs } from "@mastra/core/processors";
import { RequestContext } from "@mastra/core/request-context";
import { buildTurnTelemetryMetadata } from "../mastra-telemetry";
import { summarizeToolSpans } from "../tool-audit-context";
import { describe, expect, it, vi } from "vitest";
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

  it("recovers when Mastra has not yet materialized a response message", () => {
    const onlyUser = { get: { all: { db: () => [
      { id: "active", role: "user", content: { parts: [] } },
    ] } } } as never;
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep, messageList: onlyUser,
    })).toEqual({ retry: true });
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep, messageId: "nonexistent",
    })).toEqual({ retry: true });
  });

  it("joins retry decisions to the final canonical ai_runs payload without another write", () => {
    for (const status of ["success", "error"] as const) {
      const requestContext = new RequestContext();
      expect(geminiMalformedFirstStepRetry.processAPIError({
        ...firstStep, requestContext,
      })).toEqual({ retry: true });
      const metadata = buildTurnTelemetryMetadata({
        agentMapKey: "hostOpsAgent",
        agent: { model: "google/gemini-3.5-flash" },
        status,
        durationMs: 12,
        toolSummary: summarizeToolSpans([]),
        requestContext,
      });
      expect(metadata.gemini_malformed_retry).toEqual({
        decisions: ["retry_requested"],
        final_turn_status: status,
      });
      expect(metadata.server_environment).toBeTruthy();
      expect(metadata.deployment_sha).toBeTruthy();
    }
    const noRetry = buildTurnTelemetryMetadata({
      agentMapKey: "hostOpsAgent",
      agent: {},
      status: "success",
      durationMs: 1,
      toolSummary: summarizeToolSpans([]),
    });
    expect(noRetry.gemini_malformed_retry).toBeUndefined();
  });

  it("recognizes the exact provider finish reason in a wrapped error cause", () => {
    expect(geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep,
      error: { code: "STREAM_WRAPPER", cause: malformed },
    })).toEqual({ retry: true });
  });

  it("logs one structured line per decision with no message content", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    geminiMalformedFirstStepRetry.processAPIError({ ...firstStep, agent: { id: "host-ops-agent" } as never });
    geminiMalformedFirstStepRetry.processAPIError({
      ...firstStep, messageList: messageList(["tool-invocation"]), agent: { id: "host-ops-agent" } as never,
    });
    const lines = warn.mock.calls.map((c) => JSON.parse(String(c[0])));
    warn.mockRestore();
    expect(lines.map((l) => [l.event, l.outcome, l.agent])).toEqual([
      ["gemini_malformed_recovery", "retry", "host-ops-agent"],
      ["gemini_malformed_recovery", "refused_tool_ran", "host-ops-agent"],
    ]);
    expect(Object.keys(lines[0]).sort()).toEqual(["agent", "event", "model", "outcome", "sha", "ts"]);
  });
});
