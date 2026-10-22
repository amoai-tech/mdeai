import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeModelIdFromEnv,
  AI_MODEL_CAPABILITIES,
  GEMINI_FLASH_MODEL_ID,
  modelIdForProvider,
  NVIDIA_API_BASE_URL,
  NVIDIA_MASTRA_ROUTER_MODEL_ID,
  NVIDIA_MODEL_ID,
  parseAiProvider,
  providerForModelId,
} from "@/lib/ai-model-ids";
import {
  activeAiModelId,
  activeAiProvider,
  createNvidiaLanguageModel,
  nvidiaReasoningEffort,
  structuredOutputProviderOptions,
} from "@/lib/ai-provider";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider selection", () => {
  it("keeps Gemini for unset and blank values", () => {
    expect(parseAiProvider(undefined)).toBe("gemini");
    expect(parseAiProvider("")).toBe("gemini");
    expect(parseAiProvider("  GEMINI ")).toBe("gemini");
  });

  it("selects NVIDIA explicitly and case-insensitively", () => {
    expect(parseAiProvider("nvidia")).toBe("nvidia");
    expect(parseAiProvider(" NVIDIA ")).toBe("nvidia");
  });

  it("rejects an unknown provider instead of silently running Gemini", () => {
    expect(() => parseAiProvider("openai")).toThrow(/MDE_AI_PROVIDER/);
  });

  it("maps providers to the model id the API receives", () => {
    expect(modelIdForProvider("gemini")).toBe(GEMINI_FLASH_MODEL_ID);
    expect(modelIdForProvider("nvidia")).toBe(NVIDIA_MODEL_ID);
  });

  it("uses the documented Mastra router id only as a distinct constant", () => {
    expect(NVIDIA_MASTRA_ROUTER_MODEL_ID).toBe(
      "nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b",
    );
    expect(NVIDIA_MODEL_ID).toBe(
      "nvidia/nemotron-3.5-super-vl-120b-a12b",
    );
    expect(NVIDIA_MODEL_ID).not.toBe(NVIDIA_MASTRA_ROUTER_MODEL_ID);
    expect(NVIDIA_API_BASE_URL).toBe("https://integrate.api.nvidia.com/v1");
  });

  it("attributes a recorded model id to its provider", () => {
    expect(providerForModelId(GEMINI_FLASH_MODEL_ID)).toBe("gemini");
    expect(providerForModelId(NVIDIA_MODEL_ID)).toBe("nvidia");
    expect(
      providerForModelId(
        "nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b",
      ),
    ).toBe("nvidia");
    expect(providerForModelId(undefined)).toBe("gemini");
  });

  it("reads the selected model from the environment", () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    expect(activeModelIdFromEnv()).toBe(NVIDIA_MODEL_ID);
    vi.stubEnv("MDE_AI_PROVIDER", "gemini");
    expect(activeModelIdFromEnv()).toBe(GEMINI_FLASH_MODEL_ID);
  });
});

describe("capability records", () => {
  it("records both capabilities for every selectable model", () => {
    for (const id of [GEMINI_FLASH_MODEL_ID, NVIDIA_MODEL_ID]) {
      const record = AI_MODEL_CAPABILITIES[id];
      expect(record, `missing capability record for ${id}`).toBeDefined();
      expect(record.functionCalling).toBe(true);
      expect(record.structuredOutput).toBe(true);
      expect(record.basis.length).toBeGreaterThan(20);
    }
  });
});

describe("NVIDIA model construction", () => {
  it("builds the direct NVIDIA model id without a network call", () => {
    const model = createNvidiaLanguageModel("test-key");
    expect(model.modelId).toBe(NVIDIA_MODEL_ID);
    expect(model.provider).toBe("nvidia.chat");
    expect(model.specificationVersion).toBe("v2");
  });

  it("rejects an empty key with an actionable message", () => {
    expect(() => createNvidiaLanguageModel("  ")).toThrow(/non-empty NVIDIA API key/);
  });

  it("disables reasoning only for NVIDIA structured calls", () => {
    expect(structuredOutputProviderOptions("nvidia")).toEqual({
      nvidia: { reasoningEffort: "none" },
    });
    expect(structuredOutputProviderOptions("gemini")).toBeUndefined();
  });
});

describe("NVIDIA reasoning options", () => {
  it("rejects the unsupported medium mode", () => {
    vi.stubEnv("MDE_NVIDIA_REASONING_EFFORT", "medium");
    expect(() => nvidiaReasoningEffort()).toThrow(/MDE_NVIDIA_REASONING_EFFORT/);
  });
});

describe("active provider", () => {
  it("reads MDE_AI_PROVIDER at call time", () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "test-key");
    expect(activeAiProvider()).toBe("nvidia");
    expect(activeAiModelId()).toBe(NVIDIA_MODEL_ID);
  });

  it("uses Gemini when unset", () => {
    vi.stubEnv("MDE_AI_PROVIDER", "");
    expect(activeAiProvider()).toBe("gemini");
    expect(activeAiModelId()).toBe(GEMINI_FLASH_MODEL_ID);
  });
});
