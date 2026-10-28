import { createScorer } from "@mastra/core/evals";
import { generateObject } from "ai";
import { z } from "zod";
import { ACTIVE_AI_PROVIDER, ACTIVE_TEXT_MODEL } from "../lib/models";
import { extractClaims, type FaithfulnessClaim } from "./faithfulness-core";
import {
  evaluateGroundingCoverage,
  type GroundingCoverageInput,
  type GroundingCoverageReply,
} from "./grounding-coverage-core";

/**
 * AGT-00B — Grounding-coverage scorer (SAN-605).
 *
 * Entity-mention precision: every named listing/venue/event in the reply must
 * appear in tool output. Reuses the 590 judge pattern for false-positive demotion.
 */

const JUDGE_CONTEXT_KEY = "groundingCoverageJudge";

type PreprocessResult = {
  claims: FaithfulnessClaim[];
  unsupported: FaithfulnessClaim[];
};

type AnalyzeResult = {
  uncovered: FaithfulnessClaim[];
  judged: boolean;
};

function getReply(output: GroundingCoverageReply | undefined): GroundingCoverageReply {
  return { reply: output?.reply ?? "" };
}

function getInput(input: GroundingCoverageInput | undefined): GroundingCoverageInput {
  return { toolOutputs: input?.toolOutputs ?? [] };
}

function judgeEnabled(requestContext: unknown): boolean {
  // A judge uses the configured provider; do not require a Google key for NVIDIA.
  const key = ACTIVE_AI_PROVIDER === "nvidia"
    ? process.env.NVIDIA_API_KEY
    : process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key?.trim()) return false;
  const ctx = requestContext as { get?: (k: string) => unknown } | undefined;
  const flag = typeof ctx?.get === "function" ? ctx.get(JUDGE_CONTEXT_KEY) : undefined;
  return flag !== false;
}

/** A judge can clear a heuristic entity finding only by citing an actual
 * source name that contains every distinctive word from the claim. An empty
 * verdict or partial name overlap must never clear an invented venue. */
function normalizeName(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(sourceNames);
  if (!value || typeof value !== "object") return [];
  const names: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (["name", "title", "aliases", "alias", "venue_name", "listing_name", "event_name"].includes(key)) {
      if (typeof entry === "string") names.push(entry);
      if (Array.isArray(entry)) names.push(...entry.filter((s): s is string => typeof s === "string"));
    }
    if (entry && typeof entry === "object") names.push(...sourceNames(entry));
  }
  return names;
}

// Location qualifiers distinguish venues (e.g. Skyline Rooftop ≠ Skyline Rooftop Medellín).
// Do not treat city names as generic words when checking entity identity.
const GENERIC_ENTITY_WORDS = new Set(["hotel", "restaurant", "cafe", "club", "the", "el", "la"]);

export function reconcileGroundingJudgeVerdict(
  unsupported: FaithfulnessClaim[],
  uncovered: string[],
  groundedAliases: { claim: string; sourceName: string }[],
  toolOutputs: unknown[],
): FaithfulnessClaim[] {
  const confirmedAbsent = new Set(uncovered.map(normalizeName));
  const validSources = new Set(sourceNames(toolOutputs).map(normalizeName));
  return unsupported.filter((candidate) => {
    const claim = normalizeName(candidate.claim);
    if (confirmedAbsent.has(claim)) return true;
    return !groundedAliases.some((alias) => {
      const source = normalizeName(alias.sourceName);
      if (normalizeName(alias.claim) !== claim || !validSources.has(source)) return false;
      const claimWords = claim.split(" ").filter((word) => word.length > 2 && !GENERIC_ENTITY_WORDS.has(word));
      const sourceWords = new Set(source.split(" "));
      // A judge repeating its own candidate as an alias proves nothing.
      // Check EVERY identity-bearing word against the actual source name.
      return claimWords.length > 0 && claimWords.every((word) => sourceWords.has(word));
    });
  });
}

async function judgeUncovered(
  unsupported: FaithfulnessClaim[],
  toolOutputs: unknown[],
): Promise<FaithfulnessClaim[]> {
  try {
    const { object } = await generateObject({
      model: ACTIVE_TEXT_MODEL,
      schema: z.object({
        uncovered: z
          .array(z.string())
          .describe("Entity claim strings genuinely absent from tool output."),
        groundedAliases: z.array(z.object({
          claim: z.string(),
          sourceName: z.string(),
        })).default([]).describe("Exact source name that proves a flagged alias is grounded."),
      }),
      prompt: [
        "You verify whether named venues/listings/events in a concierge reply are grounded.",
        "TOOL OUTPUT:",
        JSON.stringify(toolOutputs).slice(0, 6000),
        "",
        "ENTITY MENTIONS flagged as possibly absent:",
        ...unsupported.map((c) => `- ${c.claim}`),
        "",
        "Return only entities genuinely absent from tool output.",
        "Only clear a candidate as a paraphrase when you can cite its exact source name",
        "from TOOL OUTPUT in groundedAliases: [{claim, sourceName}].",
        "If there is no concrete source name, keep the entity in uncovered.",
        "Do not make up source names; an empty uncovered list alone proves nothing.",
      ].join("\n"),
    });
    return reconcileGroundingJudgeVerdict(
      unsupported, object.uncovered, object.groundedAliases ?? [], toolOutputs,
    );
  } catch {
    return unsupported;
  }
}

export const groundingCoverageScorer = createScorer<
  GroundingCoverageInput,
  GroundingCoverageReply
>({
  id: "grounding-coverage",
  name: "Grounding Coverage",
  description:
    "Checks that every named entity in the agent reply appears in tool output. Score 1.0 = all venue/listing names grounded; lower = extra invented names.",
})
  .preprocess(({ run }): PreprocessResult => {
    const reply = getReply(run.output);
    const input = getInput(run.input);
    const verdict = evaluateGroundingCoverage(input, reply);
    const claims = extractClaims(reply.reply).filter((c) => c.type === "entity");
    return { claims, unsupported: verdict.unsupportedClaims };
  })
  .analyze(async ({ run, results }): Promise<AnalyzeResult> => {
    const pre = results.preprocessStepResult;
    if (pre.unsupported.length === 0) return { uncovered: [], judged: false };
    if (!judgeEnabled(run.requestContext)) {
      return { uncovered: pre.unsupported, judged: false };
    }
    const uncovered = await judgeUncovered(pre.unsupported, getInput(run.input).toolOutputs);
    return { uncovered, judged: true };
  })
  .generateScore(({ results }): number => {
    const total = results.preprocessStepResult.claims.length;
    const uncovered = results.analyzeStepResult.uncovered.length;
    if (total === 0) return 1;
    return Number(((total - uncovered) / total).toFixed(4));
  })
  .generateReason(({ results, score }): string => {
    const total = results.preprocessStepResult.claims.length;
    const { uncovered, judged } = results.analyzeStepResult;
    const tag = judged ? "judge-confirmed" : "heuristic";
    if (total === 0) return "No named entities in the reply — coverage N/A.";
    if (uncovered.length === 0) {
      return `All ${total} entity mention(s) grounded in tool rows (${tag}). score=${score}.`;
    }
    const sample = uncovered
      .slice(0, 3)
      .map((c) => `"${c.claim}"`)
      .join(", ");
    return `${uncovered.length}/${total} entity mention(s) not in tool output (${tag}): ${sample}. score=${score}.`;
  });

export { evaluateGroundingCoverage };
