import { describe, expect, it, vi } from "vitest";
import { NVIDIA_MODEL_ID } from "@/lib/ai-model-ids";
import { resolveAgentModelName } from "@/mastra/lib/mastra-telemetry";

const live = process.env.MDE_RUN_LIVE_NVIDIA_CAPABILITY_TESTS === "1";
if (live && !process.env.NVIDIA_API_KEY?.trim()) {
  throw new Error("Live specialist proof requires NVIDIA_API_KEY");
}

describe.skipIf(!live)("SAN-1589 existing Mastra agents execute with NVIDIA", () => {
  it("the existing Ping Agent answers without tools or fake actions", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    const { pingAgent } = await import("./index");
    expect(resolveAgentModelName(pingAgent)).toBe(NVIDIA_MODEL_ID);
    const result = await pingAgent.generate(
      "Say hello in one short sentence. Do not use tools or claim any action was saved.",
      { abortSignal: AbortSignal.timeout(25_000) },
    );
    expect(result.text.trim().length).toBeGreaterThan(4);
    expect(result.toolCalls).toHaveLength(0);
  }, 30_000);

  it("the existing Evaluation Agent reranks only supplied candidates", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
    const { evaluationAgent } = await import("./evaluation");
    expect(resolveAgentModelName(evaluationAgent)).toBe(NVIDIA_MODEL_ID);
    const result = await evaluationAgent.generate(
      'User wants Wi-Fi in Laureles. Candidate: [{"id":"qa-one","title":"Example Flat","neighborhood":"Laureles","price":95,"amenities":["wifi","desk"]}]. Rank only this supplied candidate. Output JSON only.',
      { abortSignal: AbortSignal.timeout(25_000) },
    );
    expect(result.text).toContain("qa-one");
    expect(result.text).not.toMatch(/created|published|reserved/i);
  }, 30_000);
});
