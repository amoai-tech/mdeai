import { generateObject, generateText, streamText, tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createNvidiaLanguageModel,
  STRUCTURED_OUTPUT_MAX_TOKENS,
  structuredOutputProviderOptions,
} from "@/lib/ai-provider";
import { NVIDIA_MODEL_ID } from "@/lib/ai-model-ids";
import { rentalIntentSchema } from "@/lib/rental-intent-schema";
import {
  createTokenSink,
  runWithTokenSink,
} from "@/mastra/lib/token-usage-als";
import { withTokenUsageTracking } from "./token-usage-middleware";

/**
 * SAN-1588 — opt-in live NVIDIA proof.
 *
 * This is the only test allowed to call NVIDIA. It is skipped by default so
 * `npm test` / `npm run floor` stay deterministic and free. Opt in explicitly:
 *
 *   MDE_RUN_LIVE_NVIDIA_CAPABILITY_TESTS=1 npm exec vitest run \
 *     src/mastra/lib/nvidia-model.integration.test.ts
 *
 * Opting in without `NVIDIA_API_KEY` fails with a setup message rather than a
 * green skip — a skipped test is not capability evidence.
 */
const API_KEY = process.env.NVIDIA_API_KEY?.trim();
const runLive = process.env.MDE_RUN_LIVE_NVIDIA_CAPABILITY_TESTS === "1";

if (runLive && !API_KEY) {
  throw new Error(
    "MDE_RUN_LIVE_NVIDIA_CAPABILITY_TESTS=1 requires NVIDIA_API_KEY. " +
      "Set the server-side key or omit the opt-in for deterministic tests.",
  );
}

describe.skipIf(!runLive)("NVIDIA Nemotron 3.5 Lightning live capabilities", () => {
  const model = () => createNvidiaLanguageModel(API_KEY as string);

  it("returns schema-valid rental slots with the exact budget", async () => {
    const { object } = await generateObject({
      model: model(),
      schema: rentalIntentSchema,
      prompt:
        "Extract Medellín furnished rental search slots from the user message. " +
        "Return only structured slots — never invent listings, prices or availability. " +
        "Fill neighborhood, minBedrooms and maxPricePerNight explicitly when the user states them. " +
        "User message: 2 bedrooms in Laureles under $80 per night.",
      providerOptions: structuredOutputProviderOptions("nvidia"),
      maxOutputTokens: STRUCTURED_OUTPUT_MAX_TOKENS,
      abortSignal: AbortSignal.timeout(45_000),
    });

    expect(object.action).toBe("search_now");
    expect(object.neighborhood?.toLowerCase()).toContain("laureles");
    expect(object.minBedrooms).toBe(2);
    expect(object.maxPricePerNight).toBe(80);
  }, 60_000);

  it("calls the rental tool once with a preserved budget", async () => {
    const { toolCalls } = await generateText({
      model: model(),
      tools: {
        search_rentals: tool({
          description: "Search furnished rentals in Medellín",
          inputSchema: z.object({
            neighborhood: z.string(),
            minBedrooms: z.number().int(),
            maxPricePerNight: z.number(),
          }),
          execute: async ({ neighborhood }) => ({ count: 3, neighborhood }),
        }),
      },
      prompt:
        "Use the search_rentals tool exactly once for 2 bedrooms in Laureles under $80 per night.",
      abortSignal: AbortSignal.timeout(45_000),
    });

    const rentalCalls = toolCalls.filter(
      (call) => call.toolName === "search_rentals",
    );
    expect(rentalCalls).toHaveLength(1);
    expect(rentalCalls[0]?.input).toMatchObject({
      neighborhood: expect.stringMatching(/laureles/i),
      minBedrooms: 2,
      maxPricePerNight: 80,
    });
  }, 60_000);

  it("streams text and records streaming token usage", async () => {
    const wrapped = withTokenUsageTracking(model());
    const sink = createTokenSink();

    const text = await runWithTokenSink(sink, async () => {
      const result = streamText({
        model: wrapped,
        prompt: "Say hello in five words.",
        maxOutputTokens: 64,
        abortSignal: AbortSignal.timeout(45_000),
      });
      let out = "";
      for await (const chunk of result.textStream) out += chunk;
      return out;
    });

    expect(text.trim().length).toBeGreaterThan(0);
    expect(sink.calls).toBeGreaterThan(0);
    expect(sink.totalTokens).toBeGreaterThan(0);
  }, 60_000);

  it("records non-streaming token usage for the selected model", async () => {
    const wrapped = withTokenUsageTracking(model());
    const sink = createTokenSink();

    await runWithTokenSink(sink, async () => {
      await generateText({
        model: wrapped,
        prompt: "Reply with the single word: ready.",
        maxOutputTokens: 16,
        abortSignal: AbortSignal.timeout(45_000),
      });
    });

    expect(sink.calls).toBe(1);
    expect(sink.inputTokens).toBeGreaterThan(0);
    expect(sink.outputTokens).toBeGreaterThan(0);
  }, 60_000);
});

describe.skipIf(!runLive)("Mastra Agent on the NVIDIA model", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs a real Agent tool call and records token usage", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", API_KEY as string);

    const { Agent } = await import("@mastra/core/agent");
    const { createTool } = await import("@mastra/core/tools");
    const { CONCIERGE_MODEL } = await import("./models");
    const { resolveAgentModelName } = await import("./mastra-telemetry");

    let calls = 0;
    const searchRentals = createTool({
      id: "search_rentals",
      description: "Search furnished rentals in Medellín",
      inputSchema: z.object({
        neighborhood: z.string(),
        minBedrooms: z.number().int(),
        maxPricePerNight: z.number(),
      }),
      execute: async (input) => {
        calls += 1;
        return { count: 2, ...input };
      },
    });

    const agent = new Agent({
      id: "nvidia-live-agent",
      name: "NVIDIA live agent",
      instructions:
        "You are a rental search agent. Use search_rentals for rental searches and never invent listings.",
      model: CONCIERGE_MODEL,
      tools: { search_rentals: searchRentals },
    });

    const sink = createTokenSink();
    await runWithTokenSink(sink, () =>
      agent.generate(
        "Use search_rentals exactly once for 2 bedrooms in Laureles under $80 per night.",
        { abortSignal: AbortSignal.timeout(45_000) },
      ),
    );

    expect(calls).toBe(1);
    expect(resolveAgentModelName(agent)).toBe(NVIDIA_MODEL_ID);
    expect(sink.calls).toBeGreaterThan(0);
    expect(sink.totalTokens).toBeGreaterThan(0);
  }, 60_000);
});

/**
 * The model id is asserted without a network call so a copy/paste regression in
 * the direct-vs-router id is caught even when the live suite is skipped.
 */
describe("NVIDIA model identity", () => {
  it("uses the direct API id, not the Mastra router id", () => {
    expect(createNvidiaLanguageModel("test-key").modelId).toBe(NVIDIA_MODEL_ID);
  });
});
