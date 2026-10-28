import { afterEach, describe, expect, it, vi } from "vitest";
import { GEMINI_FLASH_MODEL_ID, NVIDIA_MODEL_ID } from "@/lib/ai-model-ids";
import { resolveAgentModelName } from "@/mastra/lib/mastra-telemetry";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

// Static import specifiers and fixed exports keep this test analyzable by Vite
// and prevent a dynamic import/property-access security sink.
const agentModules = [
  ["rentalAgent", async () => (await import("./rental-agent")).rentalAgent],
  ["eventAgent", async () => (await import("./event-agent")).eventAgent],
  ["partnerAgent", async () => (await import("./partner-agent")).partnerAgent],
  ["hostOpsAgent", async () => (await import("./host-ops")).hostOpsAgent],
  ["routerAgent", async () => (await import("./router")).routerAgent],
  ["evaluationAgent", async () => (await import("./evaluation")).evaluationAgent],
  ["pingAgent", async () => (await import("./index")).pingAgent],
] as const;

describe("SAN-1589 specialist model selection", () => {
  for (const [exportName, loadAgent] of agentModules) {
    it(exportName + " uses NVIDIA when selected", async () => {
      vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
      vi.stubEnv("NVIDIA_API_KEY", "test-nvidia-key");
      const agent = await loadAgent();
      expect(resolveAgentModelName(agent)).toBe(NVIDIA_MODEL_ID);
    });
  }

  it("retains Gemini for explicit Gemini selection", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "gemini");
    const { rentalAgent } = await import("./rental-agent");
    expect(resolveAgentModelName(rentalAgent)).toBe(GEMINI_FLASH_MODEL_ID);
  });
});
