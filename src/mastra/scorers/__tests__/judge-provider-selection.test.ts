import { afterEach, describe, expect, it, vi } from "vitest";
import { NVIDIA_MODEL_ID } from "@/lib/ai-model-ids";

const modelJudge = vi.hoisted(() => vi.fn());
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateObject: modelJudge,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  modelJudge.mockReset();
});

const toolOutputs = [{ results: [{ name: "Carmen", price_monthly: 3_100_000 }] }];

describe.each([" NVIDIA ", "NvIdIa"])("NVIDIA judge selection with env %j", (provider) => {
  it("runs both configured NVIDIA judges even without a Google key", async () => {
    vi.stubEnv("MDE_AI_PROVIDER", provider);
    vi.stubEnv("NVIDIA_API_KEY", "test-nvidia-key");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    modelJudge.mockResolvedValue({
      object: {
        fabricated: ["9,900,000 COP", "Skyline Rooftop Penthouse"],
        uncovered: ["Skyline Rooftop Penthouse"],
      },
    });

    const { faithfulnessScorer } = await import("../faithfulness");
    const { groundingCoverageScorer } = await import("../grounding-coverage");

    const faithfulness = await faithfulnessScorer.run({
      input: { toolOutputs },
      output: { reply: "Try Skyline Rooftop Penthouse for 9,900,000 COP per month." },
    });
    const grounding = await groundingCoverageScorer.run({
      input: { toolOutputs },
      output: { reply: "Choose Carmen or Skyline Rooftop Penthouse." },
    });

    expect(faithfulness.score).toBeLessThan(1);
    expect(grounding.score).toBeLessThan(1);
    expect(faithfulness.reason).toContain("judge-confirmed");
    expect(grounding.reason).toContain("judge-confirmed");
    expect(modelJudge).toHaveBeenCalledTimes(2);
    expect(modelJudge.mock.calls.every(([args]) => args.model.modelId === NVIDIA_MODEL_ID)).toBe(true);
  });
});

it("does not borrow a Google key when NVIDIA is selected with whitespace", async () => {
  vi.stubEnv("MDE_AI_PROVIDER", " NVIDIA ");
  vi.stubEnv("NVIDIA_API_KEY", "");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-google-key");
  // Existing provider configuration fails closed before agent/scorer registration.
  await expect(import("../grounding-coverage")).rejects.toThrow("requires NVIDIA_API_KEY");
  expect(modelJudge).not.toHaveBeenCalled();
});

it("does not call the model judge with only the wrong provider key", async () => {
  vi.stubEnv("MDE_AI_PROVIDER", "gemini");
  vi.stubEnv("NVIDIA_API_KEY", "test-nvidia-key");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
  const { faithfulnessScorer } = await import("../faithfulness");
  const result = await faithfulnessScorer.run({
    input: { toolOutputs },
    output: { reply: "Try Skyline Rooftop Penthouse for 9,900,000 COP per month." },
  });
  expect(result.score).toBeLessThan(1);
  expect(result.reason).toContain("heuristic");
  expect(modelJudge).not.toHaveBeenCalled();
});
