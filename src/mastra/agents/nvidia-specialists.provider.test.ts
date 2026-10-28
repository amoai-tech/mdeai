import { afterEach, describe, expect, it, vi } from "vitest";
import { GEMINI_FLASH_MODEL_ID, NVIDIA_MODEL_ID } from "@/lib/ai-model-ids";
import { resolveAgentModelName } from "@/mastra/lib/mastra-telemetry";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

const agentModules = [
  ["./rental-agent", "rentalAgent"],
  ["./event-agent", "eventAgent"],
  ["./partner-agent", "partnerAgent"],
  ["./host-ops", "hostOpsAgent"],
  ["./router", "routerAgent"],
  ["./evaluation", "evaluationAgent"],
  ["./index", "pingAgent"],
] as const;

describe("SAN-1589 specialist model selection", () => {
  for (const [file, exportName] of agentModules) {
    it(exportName + " uses NVIDIA when selected", async () => {
      vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
      vi.stubEnv("NVIDIA_API_KEY", "test-nvidia-key");
      const agentExports = await import(/* @vite-ignore */ file);
      expect(resolveAgentModelName(agentExports[exportName])).toBe(NVIDIA_MODEL_ID);
    });
  }

  it("retains Gemini for explicit Gemini selection", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "gemini");
    const { rentalAgent } = await import("./rental-agent");
    expect(resolveAgentModelName(rentalAgent)).toBe(GEMINI_FLASH_MODEL_ID);
  });
});
