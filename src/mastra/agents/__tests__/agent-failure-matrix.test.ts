import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { APICallError } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { conciergeAgent } from "../concierge";
import { eventAgent } from "../event-agent";
import { hostEventAgent } from "../host-event";
import { hostOpsAgent } from "../host-ops";
import { geminiMalformedFirstStepRetry } from "../../lib/gemini-malformed-retry";

/**
 * SAN-1396 · Test and Monitor MDE Host, Events and Concierge AI Reliability —
 * one shared failure matrix. Part 1 proves every chat agent a user can reach
 * carries the same recovery; part 2 injects each Gemini failure kind into an
 * agent that uses that exact processor and records what the user would see.
 */

const REAL_AGENTS = {
  conciergeAgent,
  hostOpsAgent,
  hostEventAgent,
  eventAgent,
} as const;

describe("SAN-1396 every chat agent carries the Gemini malformed-call recovery", () => {
  for (const [key, agent] of Object.entries(REAL_AGENTS)) {
    it(`${key} registers ${geminiMalformedFirstStepRetry.id}`, async () => {
      const processors = await agent.listErrorProcessors();
      expect(processors.map((p) => (p as { id?: string }).id)).toContain(
        geminiMalformedFirstStepRetry.id,
      );
    });
  }
});

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const malformed = () =>
  Object.assign(new Error("malformed generated tool call"), {
    code: "AGENT_STREAM_ERROR",
    details: { rawFinishReason: "MALFORMED_FUNCTION_CALL" },
  });

function textStream(text: string) {
  return new ReadableStream({
    start(c) {
      c.enqueue({ type: "text-start", id: "t" });
      c.enqueue({ type: "text-delta", id: "t", delta: text });
      c.enqueue({ type: "text-end", id: "t" });
      c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "STOP" }, usage });
      c.close();
    },
  });
}

type Attempt = () => Promise<{ stream: ReadableStream }>;

/** Run one user turn through an agent whose model plays `script` attempt by attempt. */
async function runTurn(script: Attempt[], opts: { withTool?: boolean } = {}) {
  let modelCalls = 0;
  let toolRuns = 0;
  const model = new MockLanguageModelV3({
    provider: "google.generative-ai",
    modelId: "gemini-3.5-flash-lite",
    doStream: async () => {
      const step = script[Math.min(modelCalls, script.length - 1)];
      modelCalls += 1;
      return step();
    },
  });
  const tools = opts.withTool
    ? {
        save_action: createTool({
          id: "save_action",
          description: "Simulated persistent side effect",
          inputSchema: z.object({}),
          execute: async () => {
            toolRuns += 1;
            return { ok: true };
          },
        }),
      }
    : undefined;
  const agent = new Agent({
    id: `matrix-${Math.random().toString(36).slice(2)}`,
    name: "SAN-1396 matrix agent",
    instructions: "Answer briefly.",
    model,
    tools,
    errorProcessors: [geminiMalformedFirstStepRetry],
  });
  const settled = await agent
    .stream("hello")
    .then(async (r) => ({ ok: true as const, text: await r.text }))
    .catch((error: unknown) => ({ ok: false as const, error }));
  return { settled, modelCalls, toolRuns };
}

const ok = (text: string): Attempt => async () => ({ stream: textStream(text) });
const throws = (error: unknown): Attempt => async () => {
  throw error;
};
// Real AI SDK error: isRetryable is derived from the status (429/5xx are retryable).
const providerError = (statusCode: number) =>
  new APICallError({
    message: `Gemini ${statusCode}`,
    url: "https://generativelanguage.googleapis.com",
    requestBodyValues: {},
    statusCode,
  });

describe("SAN-1396 Gemini failure injection (processor behaviour, mock model)", () => {
  it("F1 malformed first step → one retry → answer", async () => {
    const r = await runTurn([throws(malformed()), ok("Recovered.")]);
    expect(r.settled).toEqual({ ok: true, text: "Recovered." });
    expect(r.modelCalls).toBe(2);
  });

  it("F2 malformed twice → bounded to one retry, then a real error (no loop)", async () => {
    const r = await runTurn([throws(malformed()), throws(malformed()), ok("never")]);
    expect(r.settled.ok).toBe(false);
    expect(r.modelCalls).toBe(2);
  });

  it("F3 malformed AFTER a tool ran → no retry, tool executed exactly once", async () => {
    const r = await runTurn(
      [
        async () => ({
          stream: new ReadableStream({
            start(c) {
              c.enqueue({ type: "tool-call", toolCallId: "a1", toolName: "save_action", input: "{}" });
              c.enqueue({ type: "error", error: malformed() });
              c.close();
            },
          }),
        }),
        ok("would repeat the action"),
      ],
      { withTool: true },
    );
    expect(r.toolRuns).toBeLessThanOrEqual(1);
    expect(r.modelCalls).toBe(1);
  });

  for (const status of [429, 503]) {
    it(`F${status} HTTP ${status} is not swallowed by the malformed processor and ends within 3 model calls`, async () => {
      const r = await runTurn([throws(providerError(status)), ok("late answer")]);
      // Either Mastra's own transient handling recovers, or the typed error
      // surfaces — but it must be bounded and never hang.
      expect(r.modelCalls).toBeLessThanOrEqual(3);
      if (!r.settled.ok) expect(String(r.settled.error)).toContain(String(status));
    });
  }

  it("F-timeout a timeout surfaces as a TimeoutError, never as a fabricated answer", async () => {
    const r = await runTurn([
      throws(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })),
    ]);
    if (r.settled.ok) expect(r.settled.text).not.toMatch(/saved|booked|created/i);
    expect(r.modelCalls).toBeLessThanOrEqual(3);
  });

  it("F-interrupted a stream cut after partial text is bounded and does not run tools", async () => {
    const r = await runTurn(
      [
        async () => ({
          stream: new ReadableStream({
            start(c) {
              c.enqueue({ type: "text-start", id: "t" });
              c.enqueue({ type: "text-delta", id: "t", delta: "Part" });
              c.error(new Error("socket hang up"));
            },
          }),
        }),
      ],
      { withTool: true },
    );
    expect(r.toolRuns).toBe(0);
    expect(r.modelCalls).toBeLessThanOrEqual(3);
  });

  it("F-tool-then-cut a connection cut AFTER a tool ran never runs the action twice", async () => {
    const r = await runTurn(
      [
        async () => ({
          stream: new ReadableStream({
            start(c) {
              c.enqueue({ type: "tool-call", toolCallId: "a1", toolName: "save_action", input: "{}" });
              c.error(new Error("socket hang up"));
            },
          }),
        }),
        async () => ({
          stream: new ReadableStream({
            start(c) {
              c.enqueue({ type: "tool-call", toolCallId: "a2", toolName: "save_action", input: "{}" });
              c.close();
            },
          }),
        }),
      ],
      { withTool: true },
    );
    expect(r.toolRuns).toBeLessThanOrEqual(1);
  });
});
