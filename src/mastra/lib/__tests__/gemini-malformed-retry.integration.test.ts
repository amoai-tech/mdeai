import { Agent } from "@mastra/core/agent";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { geminiMalformedFirstStepRetry } from "../gemini-malformed-retry";

describe("SAN-1396 Mastra agent stream recovery", () => {
  it("recovers a first-step Gemini malformed function call without duplicating a completed action", async () => {
    let attempts = 0;
    const model = new MockLanguageModelV3({
      provider: "google.generative-ai",
      modelId: "gemini-3.5-flash-lite",
      doStream: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("invalid Gemini function call"), {
            code: "AGENT_STREAM_ERROR",
            details: { rawFinishReason: "MALFORMED_FUNCTION_CALL" },
          });
        }
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-start", id: "text1" });
              controller.enqueue({ type: "text-delta", id: "text1", delta: "The saved secret is zebra." });
              controller.enqueue({ type: "text-end", id: "text1" });
              controller.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "STOP" }, usage: { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 7, text: 7, reasoning: 0 } } });
              controller.close();
            },
          }),
        };
      },
    });

    const agent = new Agent({
      id: "gemini-malformed-retry-integration",
      name: "Gemini malformed retry integration",
      instructions: "Answer the user using the supplied context.",
      model,
      errorProcessors: [geminiMalformedFirstStepRetry],
    });

    const reply = await agent.stream("What was my earlier secret word?");
    expect(await reply.text).toContain("zebra");
    expect(attempts).toBe(2);
  });

  it("recovers a malformed error event emitted from an active provider stream", async () => {
    let attempts = 0;
    const model = new MockLanguageModelV3({
      provider: "google.generative-ai",
      modelId: "gemini-3.5-flash-lite",
      doStream: async () => {
        attempts += 1;
        return {
          stream: new ReadableStream({
            start(controller) {
              if (attempts === 1) {
                controller.enqueue({
                  type: "error",
                  error: Object.assign(new Error("malformed generated tool call"), {
                    code: "AGENT_STREAM_ERROR",
                    details: { rawFinishReason: "MALFORMED_FUNCTION_CALL" },
                  }),
                });
              } else {
                controller.enqueue({ type: "text-start", id: "t1" });
                controller.enqueue({ type: "text-delta", id: "t1", delta: "Recovered answer." });
                controller.enqueue({ type: "text-end", id: "t1" });
                controller.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "STOP" }, usage: { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 2, text: 2, reasoning: 0 } } });
              }
              controller.close();
            },
          }),
        };
      },
    });
    const agent = new Agent({
      id: "gemini-malformed-retry-stream-error",
      name: "Gemini malformed stream-error recovery",
      instructions: "Answer the user's question.",
      model,
      errorProcessors: [geminiMalformedFirstStepRetry],
    });
    const response = await agent.stream("Hello");
    expect(await response.text).toBe("Recovered answer.");
    expect(attempts).toBe(2);
  });
});
