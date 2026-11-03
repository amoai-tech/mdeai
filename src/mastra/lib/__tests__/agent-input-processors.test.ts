import { describe, it, expect, afterEach, vi } from "vitest";
import { getDefaultInputProcessors } from "../agent-input-processors";

describe("getDefaultInputProcessors", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("supports the concierge's scoped 12k context budget", () => {
    expect(getDefaultInputProcessors(12_288)).toHaveLength(1);
    expect(getDefaultInputProcessors()).toHaveLength(1);
    expect(getDefaultInputProcessors(12_288)[0]).toMatchObject({ maxTokens: 12_288 });
    expect(getDefaultInputProcessors()[0]).toMatchObject({ maxTokens: 8192 });
  });

  it("skips PromptInjectionDetector in development by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MASTRA_PROMPT_INJECTION_GUARD", "");
    const processors = getDefaultInputProcessors();
    expect(processors).toHaveLength(1);
  });

  // PERF-002: the LLM injection detector is now opt-in (it added a full extra
  // Gemini round-trip per turn). Production no longer enables it by default.
  it("skips PromptInjectionDetector in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MASTRA_PROMPT_INJECTION_GUARD", "");
    expect(getDefaultInputProcessors()).toHaveLength(1);
  });

  it("allows the concierge to reserve room for the verified selection and follow-up memory", () => {
    vi.stubEnv("MASTRA_PROMPT_INJECTION_GUARD", "");
    const [limiter] = getDefaultInputProcessors(32_768);
    expect((limiter as unknown as { maxTokens: number }).maxTokens).toBeGreaterThanOrEqual(32768);
  });

  it("enables PromptInjectionDetector only when MASTRA_PROMPT_INJECTION_GUARD=true", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MASTRA_PROMPT_INJECTION_GUARD", "true");
    expect(getDefaultInputProcessors()).toHaveLength(2);

    vi.stubEnv("NODE_ENV", "production");
    expect(getDefaultInputProcessors()).toHaveLength(2);
  });
});
