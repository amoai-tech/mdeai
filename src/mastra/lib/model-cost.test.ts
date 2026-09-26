import { describe, expect, it } from "vitest";
import { GEMINI_FLASH_MODEL_ID } from "@/lib/ai-model-ids";
import { calculateModelCost, getModelRate } from "./model-cost";

/**
 * The rate table is the verification artifact for `model-cost.ts`.
 *
 * Every number below is pinned against the verbatim quote in that file's header,
 * read from https://ai.google.dev/gemini-api/docs/pricing (Standard tier) on
 * 2026-09-26. Editing a rate therefore has to be a deliberate act that also
 * updates the citation — the alternative is what this replaced: three entries
 * silently understating cost by ~3-5x, with nothing to catch it.
 */
describe("official Gemini rate table (verified 2026-09-26)", () => {
  it.each([
    // model id, quoted input, quoted output
    ["gemini-3.5-flash", 1.5, 9],
    ["gemini-3.5-flash-lite", 0.3, 2.5],
    ["gemini-3.1-flash-lite", 0.25, 1.5],
    ["gemini-3.1-pro-preview", 2, 12],
  ])("prices %s at the published rate", (modelId, input, output) => {
    const rate = getModelRate(modelId);
    expect(rate.inputPerMillion).toBe(input);
    expect(rate.outputPerMillion).toBe(output);
  });

  it("prices the configured development default from the table, not the fallback", () => {
    const { rateFallback } = calculateModelCost({
      modelName: GEMINI_FLASH_MODEL_ID,
      inputTokens: 1,
      outputTokens: 1,
    });
    // If this fails, the model was switched without adding its rate: every turn
    // would be recorded as an approximation instead of a real number.
    expect(rateFallback).toBe(false);
  });
});

describe("calculateModelCost (COST-001)", () => {
  it("prices a known model from the rate table", () => {
    // gemini-3.5-flash: $1.50/1M in, $9.00/1M out
    const { estimatedCostUsd, rateFallback } = calculateModelCost({
      modelName: "gemini-3.5-flash",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(estimatedCostUsd).toBeCloseTo(10.5, 6);
    expect(rateFallback).toBe(false);
  });

  it("prices the development-phase default", () => {
    const { estimatedCostUsd, rateFallback } = calculateModelCost({
      modelName: GEMINI_FLASH_MODEL_ID,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(estimatedCostUsd).toBeCloseTo(2.8, 6); // $0.30 in + $2.50 out
    expect(rateFallback).toBe(false);
  });

  it("never rounds a tiny cost to exactly 0", () => {
    const { estimatedCostUsd } = calculateModelCost({
      modelName: "gemini-3.5-flash",
      inputTokens: 500,
      outputTokens: 200,
    });
    expect(estimatedCostUsd).toBeGreaterThan(0);
  });

  it("flags fallback for an unknown model but still prices it", () => {
    const r = calculateModelCost({
      modelName: "gemini-9-experimental",
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(r.rateFallback).toBe(true);
    expect(r.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("treats missing / negative / null tokens as zero", () => {
    expect(
      calculateModelCost({ modelName: "gemini-3.5-flash", inputTokens: null, outputTokens: undefined }).estimatedCostUsd,
    ).toBe(0);
    expect(
      calculateModelCost({ modelName: "gemini-3.5-flash", inputTokens: -5, outputTokens: -1 }).estimatedCostUsd,
    ).toBe(0);
  });

  it("prices an unknown model at the highest known rate, never a cheap one", () => {
    // The fallback is derived as the table's maximum, so an unrecognised id can
    // never look cheaper than every model we actually know about.
    const unknown = getModelRate("nope");
    const highest = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"]
      .map(getModelRate)
      .reduce((max, rate) =>
        rate.inputPerMillion + rate.outputPerMillion >
        max.inputPerMillion + max.outputPerMillion
          ? rate
          : max,
      );
    expect(unknown).toEqual(highest);
    expect(unknown.outputPerMillion).toBe(12); // gemini-3.1-pro-preview
  });

  it("exposes the rate table for dashboards", () => {
    expect(getModelRate("gemini-3.5-flash").outputPerMillion).toBe(9);
    expect(getModelRate(GEMINI_FLASH_MODEL_ID).inputPerMillion).toBe(0.3);
  });
});
