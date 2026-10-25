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
    // The pinned Google provider currently supplies an AI SDK V2 language model.
    expect((FLASH_MODEL as unknown as ModelWithId).specificationVersion).toBe(
      "v2",
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
