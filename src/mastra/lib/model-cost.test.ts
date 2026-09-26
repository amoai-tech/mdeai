import { describe, expect, it } from "vitest";
import { GEMINI_FLASH_MODEL_ID } from "@/lib/ai-model-ids";
import { calculateModelCost, getModelRate } from "./model-cost";

describe("calculateModelCost (COST-001)", () => {
  it("prices a known model from the rate table", () => {
    // gemini-3.5-flash: $1.50/1M in, $9.00/1M out (official, checked 2026-09-26)
    const { estimatedCostUsd, rateFallback } = calculateModelCost({
      modelName: "gemini-3.5-flash",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(estimatedCostUsd).toBeCloseTo(10.5, 6);
    expect(rateFallback).toBe(false);
  });

  // The development-phase default must be priced directly, not via FALLBACK_RATE:
  // `rateFallback: true` on every turn would make the flag meaningless.
  it("prices the development-phase default without falling back", () => {
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

  it("exposes the rate table for dashboards", () => {
    expect(getModelRate("gemini-3.5-flash").outputPerMillion).toBe(9);
    expect(getModelRate(GEMINI_FLASH_MODEL_ID).inputPerMillion).toBe(0.3);
    expect(getModelRate("nope")).toEqual(getModelRate("gemini-3.5-flash"));
  });
});
