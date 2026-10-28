import { describe, expect, it } from "vitest";
import { faithfulnessScorer } from "./faithfulness";
import { groundingCoverageScorer } from "./grounding-coverage";
import { NVIDIA_MODEL_ID } from "@/lib/ai-model-ids";
import { ACTIVE_AI_PROVIDER, ACTIVE_TEXT_MODEL } from "../lib/models";

/**
 * Opt-in paid, unmocked NVIDIA judge proof. Default CI remains deterministic.
 * Run with MDE_AI_PROVIDER=nvidia MDE_RUN_LIVE_NVIDIA_CAPABILITY_TESTS=1.
 */
const live = process.env.MDE_RUN_LIVE_NVIDIA_CAPABILITY_TESTS === "1";
if (live && (!process.env.NVIDIA_API_KEY?.trim() || ACTIVE_AI_PROVIDER !== "nvidia")) {
  throw new Error("Live NVIDIA judges require NVIDIA_API_KEY and MDE_AI_PROVIDER=nvidia");
}

describe.skipIf(!live)("SAN-1589 real NVIDIA evaluation scorers", () => {
  const toolOutputs = [{
    results: [{ name: "Carmen", price_monthly: 3_100_000 }],
  }];

  it("uses the configured NVIDIA model and judges a fabricated price", async () => {
    expect(ACTIVE_TEXT_MODEL.modelId).toBe(NVIDIA_MODEL_ID);
    const result = await faithfulnessScorer.run({
      input: { toolOutputs },
      output: { reply: "Try Skyline Rooftop Medellín for 9,900,000 COP per month." },
    });
    expect(result.score).toBeLessThan(1);
    expect(result.reason).toContain("judge-confirmed");
  }, 60_000);

  it("uses NVIDIA to judge an entity absent from tool results", async () => {
    expect(ACTIVE_TEXT_MODEL.modelId).toBe(NVIDIA_MODEL_ID);
    const result = await groundingCoverageScorer.run({
      input: { toolOutputs },
      output: { reply: "Choose Carmen or Skyline Rooftop Medellín." },
    });
    expect(result.score).toBeLessThan(1);
    expect(result.reason).toContain("judge-confirmed");
  }, 60_000);
});
