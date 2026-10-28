import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GEMINI_FLASH_MODEL_ID,
  NVIDIA_MODEL_ID,
} from "@/lib/ai-model-ids";

type ModelWithId = { modelId?: string; provider?: string; specificationVersion?: string };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("src/mastra/lib/models.ts provider switch", () => {
  it("builds the Gemini model by default", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");

    const { ACTIVE_AI_PROVIDER, FLASH_MODEL } = await import("./models");

    expect(ACTIVE_AI_PROVIDER).toBe("gemini");
    expect((FLASH_MODEL as unknown as ModelWithId).modelId).toBe(
      GEMINI_FLASH_MODEL_ID,
    );
    // @ai-sdk/google 3.x supplies a V3 language model (pin verified by package-lock).
    expect((FLASH_MODEL as unknown as ModelWithId).specificationVersion).toBe(
      "v3",
    );
  });

  it("builds the NVIDIA model when MDE_AI_PROVIDER=nvidia", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "test-key");

    const { ACTIVE_AI_PROVIDER, FLASH_MODEL, CONCIERGE_MODEL } = await import("./models");

    expect(ACTIVE_AI_PROVIDER).toBe("nvidia");
    expect((FLASH_MODEL as unknown as ModelWithId).modelId).toBe(GEMINI_FLASH_MODEL_ID);
    expect((CONCIERGE_MODEL as unknown as ModelWithId).modelId).toBe(NVIDIA_MODEL_ID);
    expect((CONCIERGE_MODEL as unknown as ModelWithId).provider).toBe("nvidia.chat");
    expect((CONCIERGE_MODEL as unknown as ModelWithId).specificationVersion).toBe("v2");
  });

  it("falls back to Gemini when NVIDIA is slow without retrying the same model", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    const { CONCIERGE_AGENT_MODEL } = await import("./models");
    expect(Array.isArray(CONCIERGE_AGENT_MODEL)).toBe(true);
    if (!Array.isArray(CONCIERGE_AGENT_MODEL)) throw new Error("expected fallback models");
    expect(CONCIERGE_AGENT_MODEL).toHaveLength(2);
    expect(CONCIERGE_AGENT_MODEL.map((entry) => entry.model.modelId)).toEqual([
      NVIDIA_MODEL_ID, GEMINI_FLASH_MODEL_ID,
    ]);
    expect(CONCIERGE_AGENT_MODEL.map((entry) => entry.maxRetries)).toEqual([0, 0]);
    expect(CONCIERGE_AGENT_MODEL[0]?.modelSettings?.timeout?.stepMs).toBeLessThan(22_000);
  });

  it("reserves enough agent time for NVIDIA and Gemini fallback steps", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    const model = await import("./models");
    expect(model.CONCIERGE_TURN_TIMEOUT_MS).toBeGreaterThan(
      model.CONCIERGE_PRIMARY_STEP_TIMEOUT_MS + model.CONCIERGE_FALLBACK_STEP_TIMEOUT_MS,
    );
    expect(model.CONCIERGE_TURN_TIMEOUT_MS).toBeLessThan(90_000);
    const { agentTurnTimeoutMs } = await import("../copilotkit/logging-mastra-agent");
    expect(agentTurnTimeoutMs("conciergeAgent")).toBe(model.CONCIERGE_TURN_TIMEOUT_MS);
    expect(agentTurnTimeoutMs("hostEventAgent")).toBe(26_000);
  });

  it("uses only Gemini when the NVIDIA switch is disabled", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "gemini");
    const { CONCIERGE_AGENT_MODEL } = await import("./models");
    expect(Array.isArray(CONCIERGE_AGENT_MODEL)).toBe(false);
  });

  it("fails loudly when NVIDIA is selected without a key", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "");

    await expect(import("./models")).rejects.toThrow(/NVIDIA_API_KEY/);
  });

  it("fails loudly when MDE_AI_PROVIDER is not a supported provider", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "openai");

    await expect(import("./models")).rejects.toThrow(/MDE_AI_PROVIDER/);
  });
});
