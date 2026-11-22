import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateFaithfulness } from "../faithfulness-core";
import { evaluateGroundingCoverage } from "../grounding-coverage-core";
import { FaithfulnessVerdictSchema } from "../verdict-schema";

/**
 * Synthetic, fixed Concierge baseline: no real availability, account data,
 * remote LLM, bookings, or third-party actions. This verifies the existing
 * scorers' claimed coverage, not complete agent-output correctness.
 */
type GoldenCase = {
  id: string;
  domain: "rentals" | "restaurants" | "events";
  toolOutputs: unknown[];
  reply: string;
  faithful: boolean;
  covered: boolean;
};

const cases = JSON.parse(
  readFileSync(new URL("./fixtures/grounded-concierge-journeys.json", import.meta.url), "utf8"),
) as GoldenCase[];

describe("Concierge grounded-answer golden cases (deterministic baseline)", () => {
  it("keeps unique, meaningful cases across Rentals, Events, Restaurants", () => {
    expect(cases).toHaveLength(5);
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
    expect(new Set(cases.map((entry) => entry.domain))).toEqual(
      new Set(["rentals", "restaurants", "events"]),
    );
    expect(cases.some((entry) => !entry.faithful)).toBe(true);
    expect(cases.some((entry) => entry.faithful)).toBe(true);
  });

  it.each(cases)("$id: pinned faithfulness and entity-coverage outcome", (entry) => {
    const input = { toolOutputs: entry.toolOutputs };
    const reply = { reply: entry.reply };
    const faith = evaluateFaithfulness(input, reply);
    const coverage = evaluateGroundingCoverage(input, reply);

    expect(FaithfulnessVerdictSchema.safeParse(faith).success).toBe(true);
    expect(FaithfulnessVerdictSchema.safeParse(coverage).success).toBe(true);
    expect(faith.claimCount).toBeGreaterThan(0);
    expect(coverage.claimCount).toBeGreaterThan(0);
    expect(faith.faithful).toBe(entry.faithful);
    expect(coverage.faithful).toBe(entry.covered);
    expect(faith.unsupportedClaims.length === 0).toBe(entry.faithful);
    expect(coverage.unsupportedClaims.length === 0).toBe(entry.covered);
  });
});
