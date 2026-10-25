import { afterEach, describe, expect, it, vi } from "vitest";
import { GEMINI_FLASH_MODEL_ID, NVIDIA_MODEL_ID } from "@/lib/ai-model-ids";

/** SAN-1201: enable the existing hostEventAgent, not another event agent. */
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("hostEventAgent provider selection", () => {
  it("retains Gemini as the default", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "gemini");
    const { hostEventAgent } = await import("./host-event");
    const { resolveAgentModelName } = await import("../lib/mastra-telemetry");
    expect(resolveAgentModelName(hostEventAgent)).toBe(GEMINI_FLASH_MODEL_ID);
  });

  it("uses Lightning only when NVIDIA is selected", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    vi.stubEnv("NVIDIA_API_KEY", "dummy-test-key");
    const { hostEventAgent } = await import("./host-event");
    const { resolveAgentModelName } = await import("../lib/mastra-telemetry");
    expect(resolveAgentModelName(hostEventAgent)).toBe(NVIDIA_MODEL_ID);
  });
});

/** Opt-in provider proof; uses the real existing Mastra host agent, no writes. */
describe.skipIf(process.env.MDE_RUN_LIVE_NVIDIA_CAPABILITY_TESTS !== "1")(
  "hostEventAgent real NVIDIA answer", () => {
    it("asks for missing event details rather than claiming an event was published", async () => {
      vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
      const { hostEventAgent } = await import("./host-event");
      const result = await hostEventAgent.generate(
        "I want to host Friday Salsa Night in Laureles, but I haven't chosen a date or venue. Ask one clarifying question; do not claim it was published.",
        { abortSignal: AbortSignal.timeout(25_000) },
      );
      expect(result.text.trim().length).toBeGreaterThan(15);
      expect(result.text).toMatch(/date|when|venue|where/i);
      expect(result.text).not.toMatch(
        /\b(?:i|we)\s+(?:have\s+)?published\b|\b(?:has|have)\s+been\s+published\b|\bsuccessfully\s+published\b|\bis\s+(?:now\s+)?live\b|\bevent\s+(?:is|was)\s+live\b|\btickets?\s+(?:was|is|were|are)\s+issued\b/i,
      );
    }, 30_000);
  },
);
