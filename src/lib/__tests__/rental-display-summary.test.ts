import { describe, expect, it } from "vitest";
import { fastPathRentalSummary } from "@/lib/rental-display";

/** SAN-407 — the chat answer for a rental search is truthful about zero results and budgets. */
describe("fastPathRentalSummary", () => {
  it("zero results is an honest empty state, not a form wall, with one optional refinement", () => {
    const text = fastPathRentalSummary(0, 0);
    expect(text).toMatch(/no rentals/i);
    expect(text).toMatch(/laureles|neighborhood/i);
    expect(text).not.toMatch(/what dates|setup/i);
    expect(text.match(/\?/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("a broad search with nothing to show says there is nothing available", () => {
    expect(fastPathRentalSummary(0, 0, { generic: true })).toMatch(/no rentals are available in this search right now/i);
  });

  it("a specific search with no match does not imply the whole marketplace is empty", () => {
    const text = fastPathRentalSummary(0, 0, { generic: false });
    expect(text).toMatch(/no rentals match that search/i);
    expect(text).not.toMatch(/available right now/i);
    expect(text).not.toMatch(/verified rentals/i);
    expect(text.match(/\?/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("never claims pins or cards for zero results", () => {
    expect(fastPathRentalSummary(0, 0)).not.toMatch(/pins on the map|see cards below/i);
  });

  it("results come first; a generic search adds one optional refinement after them", () => {
    const text = fastPathRentalSummary(3, 3, { generic: true });
    expect(text.startsWith("Found 3 rentals")).toBe(true);
    expect(text).toMatch(/narrow/i);
  });

  it("a specific search adds no refinement question", () => {
    expect(fastPathRentalSummary(3, 3)).not.toMatch(/narrow|\?/);
  });

  it("is honest that a monthly budget was not applied", () => {
    const text = fastPathRentalSummary(2, 0, { budgetNotApplied: true });
    expect(text).toMatch(/budget/i);
    expect(text).toMatch(/can't filter by monthly budget/i);
    expect(text).not.toMatch(/isn't applied/i);
  });

  it("budget note also accompanies an empty answer without implying budget caused it", () => {
    const text = fastPathRentalSummary(0, 0, { budgetNotApplied: true });
    expect(text).toMatch(/no rentals/i);
    expect(text).toMatch(/budget/i);
    expect(text).toMatch(/not (yet )?(applied|filtered)|isn.t (applied|filtered)/i);
    expect(text).not.toMatch(/wider budget/i);
  });

  it("discloses the monthly budget actually applied on an empty result", () => {
    const text = fastPathRentalSummary(0, 0, { appliedBudget: "COP 2,000,000 per month" });
    expect(text).toMatch(/no rentals match that search/i);
    expect(text).toMatch(/Applied budget: COP 2,000,000 per month\./);
  });

  it("discloses the applied monthly budget alongside results", () => {
    const text = fastPathRentalSummary(2, 2, { appliedBudget: "COP 2,000,000 per month" });
    expect(text.startsWith("Found 2 rentals")).toBe(true);
    expect(text).toMatch(/Applied budget: COP 2,000,000 per month\./);
  });

  it("never claims a budget was applied when it was not", () => {
    const text = fastPathRentalSummary(2, 0, { budgetNotApplied: true });
    expect(text).not.toMatch(/Applied budget:/);
  });

  it("gives the not-applied state precedence if both flags are passed", () => {
    const text = fastPathRentalSummary(0, 0, {
      budgetNotApplied: true,
      appliedBudget: "COP 2,000,000 per month",
    });
    expect(text).toMatch(/budget was not applied/i);
    expect(text).not.toMatch(/Applied budget:/);
  });
});
