import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vitest";
import { faithfulnessScorer } from "../faithfulness";
import {
  evaluateFaithfulness,
  extractClaims,
  type FaithfulnessInput,
} from "../faithfulness-core";
import { FaithfulnessVerdictSchema } from "../verdict-schema";

/**
 * AGT-00A acceptance fixtures (SAN-590):
 *  - a grounded reply (only names/prices present in tool output) → faithful, score 1
 *  - a reply citing a fabricated listing + invented price → unfaithful, score < 1
 *
 * These fixtures are deterministic and offline. The scorer's Gemini judge switches
 * on from an ambient GOOGLE_GENERATIVE_AI_API_KEY, so the run() cases below pin it
 * **off** explicitly through request context, and the live judge path is covered
 * separately — key-gated — at the end of this file.
 */

// Two real rentals the agent's search tool returned this turn.
const TOOL_OUTPUT: FaithfulnessInput = {
  toolOutputs: [
    {
      results: [
        { id: "a1b2", title: "Casa Verde Provenza", neighborhood: "El Poblado", price_monthly: 4200000 },
        { id: "c3d4", title: "Mirador Laureles Loft", neighborhood: "Laureles", price_monthly: 3100000 },
      ],
    },
  ],
};

const GROUNDED_REPLY =
  "I found Casa Verde Provenza for 4,200,000 COP per month in El Poblado, plus the Mirador Laureles Loft at 3,100,000 COP per month.";

const FABRICATED_REPLY =
  "Try the Hotel Skyline Penthouse for 9,900,000 COP per month — it has a private rooftop pool.";

describe("faithfulness core — extractClaims", () => {
  it("extracts entity + price claims, drops generic geo words", () => {
    const claims = extractClaims(GROUNDED_REPLY);
    const entities = claims.filter((c) => c.type === "entity").map((c) => c.claim);
    const prices = claims.filter((c) => c.type === "price").map((c) => c.claim);

    expect(entities).toContain("Casa Verde Provenza");
    expect(entities).toContain("Mirador Laureles Loft");
    // "El Poblado" / "COP" are stopworded — not flagged as listing identities.
    expect(entities).not.toContain("El Poblado");
    expect(prices.length).toBeGreaterThanOrEqual(2);
  });
});

describe("faithfulness core — evaluateFaithfulness", () => {
  it("scores a fully grounded reply as faithful (1.0)", () => {
    const verdict = evaluateFaithfulness(TOOL_OUTPUT, { reply: GROUNDED_REPLY });
    expect(FaithfulnessVerdictSchema.parse(verdict)).toBeTruthy();
    expect(verdict.faithful).toBe(true);
    expect(verdict.score).toBe(1);
    expect(verdict.unsupportedClaims).toHaveLength(0);
  });

  it("flags a fabricated listing + invented price as unfaithful (< 1.0)", () => {
    const verdict = evaluateFaithfulness(TOOL_OUTPUT, { reply: FABRICATED_REPLY });
    expect(verdict.faithful).toBe(false);
    expect(verdict.score).toBeLessThan(1);
    const flagged = verdict.unsupportedClaims.map((c) => c.claim);
    expect(flagged).toContain("Hotel Skyline Penthouse");
    expect(verdict.unsupportedClaims.some((c) => c.type === "price")).toBe(true);
  });

  it("scores a reply with no checkable claims as faithful by default", () => {
    const verdict = evaluateFaithfulness(TOOL_OUTPUT, {
      reply: "Sure — what neighborhood and budget are you thinking?",
    });
    expect(verdict.claimCount).toBe(0);
    expect(verdict.score).toBe(1);
    expect(verdict.faithful).toBe(true);
  });
});

describe("faithfulness core — venue hallucination (SAN-590)", () => {
  // Two real Medellín venues the search tool returned this turn.
  const VENUE_TOOL_OUTPUT: FaithfulnessInput = {
    toolOutputs: [{ results: [{ name: "Carmen" }, { name: "O.C.I." }] }],
  };

  it("flags an invented venue (Skyline Rooftop Medellín) as unfaithful", () => {
    const verdict = evaluateFaithfulness(VENUE_TOOL_OUTPUT, {
      reply:
        "For the best views, head to Skyline Rooftop Medellín — it beats Carmen and O.C.I.",
    });
    expect(verdict.faithful).toBe(false);
    expect(verdict.score).toBeLessThan(1);
    expect(
      verdict.unsupportedClaims.some(
        (c) => c.type === "entity" && c.claim.includes("Skyline"),
      ),
    ).toBe(true);
  });
});

describe("faithfulnessScorer (Mastra createScorer) — heuristic path", () => {
  /**
   * Pin the judge OFF so this block stays deterministic and offline on every
   * machine, key or no key. Without this it silently became a live network test
   * the moment a Gemini key appeared in the environment.
   */
  function heuristicOnly() {
    const requestContext = new RequestContext();
    requestContext.set("faithfulnessJudge", false);
    return { requestContext };
  }

  it("registers with the expected id/name/description", () => {
    expect(faithfulnessScorer.id).toBe("faithfulness");
    expect(faithfulnessScorer.name).toBe("Hallucination / Faithfulness");
    expect(faithfulnessScorer.description.length).toBeGreaterThan(0);
  });

  it("run() scores the grounded reply at 1.0", async () => {
    const result = await faithfulnessScorer.run({
      ...heuristicOnly(),
      input: TOOL_OUTPUT,
      output: { reply: GROUNDED_REPLY },
    });
    expect(result.score).toBe(1);
  });

  it("run() scores the fabricated reply below 1.0", async () => {
    const result = await faithfulnessScorer.run({
      ...heuristicOnly(),
      input: TOOL_OUTPUT,
      output: { reply: FABRICATED_REPLY },
    });
    expect(result.score).toBeLessThan(1);
  });
});

const hasGeminiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());

/**
 * The live judge path — regression guard for a fail-open bug.
 *
 * The judge identified both inventions correctly but answered using the prompt's
 * own `- [type] claim` decoration (`"[price] 9,900,000 COP"`). The exact-match
 * lookup then matched nothing and dropped both, so a reply that invented a listing
 * and a price scored 1.0 — the scorer reported a hallucination as fully grounded.
 *
 * Reproduced on `gemini-3.5-flash-lite` and its predecessor `gemini-3.5-flash`,
 * which both returned the decorated strings, so this was an answer-mapping bug
 * rather than a model weakness. Key-gated because it is a real network call.
 */
describe.skipIf(!hasGeminiKey)("faithfulnessScorer — live judge path", () => {
  it("still flags the fabricated reply once the judge confirms it", async () => {
    const result = await faithfulnessScorer.run({
      input: TOOL_OUTPUT,
      output: { reply: FABRICATED_REPLY },
    });
    expect(result.score).toBeLessThan(1);
    // Proves the judge ran and confirmed, rather than the heuristic fallback.
    expect(result.reason).toContain("judge-confirmed");
  }, 60_000);

  it("keeps the grounded reply at 1.0", async () => {
    const result = await faithfulnessScorer.run({
      input: TOOL_OUTPUT,
      output: { reply: GROUNDED_REPLY },
    });
    expect(result.score).toBe(1);
  }, 60_000);
});
