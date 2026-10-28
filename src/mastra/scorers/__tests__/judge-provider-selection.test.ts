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


it("fails closed when NVIDIA judge returns no uncovered entities without grounded evidence", async () => {
  vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
  vi.stubEnv("NVIDIA_API_KEY", "test-nvidia-key");
  modelJudge.mockResolvedValue({ object: { uncovered: [] } });
  const { groundingCoverageScorer } = await import("../grounding-coverage");
  const result = await groundingCoverageScorer.run({
    input: { toolOutputs },
    output: { reply: "Choose Carmen or Skyline Rooftop Medellín." },
  });
  expect(result.score).toBeLessThan(1);
  expect(result.reason).toContain("Skyline Rooftop");
});


it("accepts only a real source-name alias with matching distinctive words", async () => {
  const { reconcileGroundingJudgeVerdict } = await import("../grounding-coverage");
  const candidates = [
    { claim: "Hotel Carmen", type: "entity" as const },
    { claim: "Skyline Rooftop Medellín", type: "entity" as const },
  ];
  const aliases = [
    { claim: "Hotel Carmen", sourceName: "Carmen" },
    { claim: "Skyline Rooftop Medellín", sourceName: "Carmen" },
  ];
  const remaining = reconcileGroundingJudgeVerdict(candidates, [], aliases, toolOutputs);
  expect(remaining.map((candidate) => candidate.claim)).toEqual(["Skyline Rooftop Medellín"]);
  expect(reconcileGroundingJudgeVerdict(candidates, [], [
    { claim: "Skyline Rooftop Medellín", sourceName: "Skyline Rooftop" },
  ], toolOutputs)).toEqual(candidates);
  expect(reconcileGroundingJudgeVerdict(candidates, ["Hotel Carmen"], aliases, toolOutputs)).toEqual(candidates);
});


it("does not clear an invented city qualifier from a real venue with shared name words", async () => {
  const { reconcileGroundingJudgeVerdict } = await import("../grounding-coverage");
  const candidate = { claim: "Skyline Rooftop Medellín", type: "entity" as const };
  const source = [{ results: [{ name: "Skyline Rooftop" }] }];
  // The model may repeat the candidate as its own 'alias'; that is not evidence.
  expect(reconcileGroundingJudgeVerdict(
    [candidate], [],
    [{ claim: candidate.claim, sourceName: "Skyline Rooftop" }],
    source,
  )).toEqual([candidate]);
  // The model must not smuggle a fabricated qualifier through an alias with just one shared word.
  expect(reconcileGroundingJudgeVerdict(
    [candidate], [],
    [{ claim: candidate.claim, sourceName: "Skyline" }],
    [{ results: [{ name: "Skyline" }] }],
  )).toEqual([candidate]);
});

it("keeps a claimed city distinguishing while allowing accents-only spelling variants", async () => {
  const { reconcileGroundingJudgeVerdict } = await import("../grounding-coverage");
  const claim = { claim: "Café Medellín", type: "entity" as const };
  const source = [{ results: [{ name: "Cafe Medellin" }] }];
  expect(reconcileGroundingJudgeVerdict([claim], [], [
    { claim: claim.claim, sourceName: "Cafe Medellin" },
  ], source)).toEqual([]);
  expect(reconcileGroundingJudgeVerdict([claim], [], [
    { claim: claim.claim, sourceName: "Cafe" },
  ], [{ results: [{ name: "Cafe" }] }])).toEqual([claim]);
});

it("never grades the invented Skyline Rooftop Medellín as fully grounded from a real Skyline Rooftop tool row", async () => {
  vi.stubEnv("MDE_AI_PROVIDER", "nvidia");
  vi.stubEnv("NVIDIA_API_KEY", "test-nvidia-key");
  modelJudge.mockResolvedValue({ object: {
    uncovered: [],
    groundedAliases: [{ claim: "Skyline Rooftop Medellín", sourceName: "Skyline Rooftop" }],
  } });
  const { groundingCoverageScorer } = await import("../grounding-coverage");
  const result = await groundingCoverageScorer.run({
    input: { toolOutputs: [{ results: [{ name: "Skyline Rooftop" }] }] },
    output: { reply: "The venue is Skyline Rooftop Medellín." },
  });
  expect(result.score).toBeLessThan(1);
  expect(result.reason).toContain("Skyline Rooftop");
  expect(modelJudge).toHaveBeenCalledOnce();
});
