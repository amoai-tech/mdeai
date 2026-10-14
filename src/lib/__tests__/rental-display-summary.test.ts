import { describe, expect, it } from "vitest";
import { fastPathRentalSummary } from "@/lib/rental-display";

/** SAN-407 — the chat answer for a rental search is truthful about zero results and budgets. */
describe("fastPathRentalSummary", () => {
  it("zero results is an honest empty state, not a form wall, with one optional refinement", () => {
    const text = fastPathRentalSummary(0, 0);
    expect(text).toMatch(/no verified rentals/i);
    expect(text).toMatch(/laureles|neighborhood/i);
    expect(text).not.toMatch(/what dates|setup/i);
    expect(text.match(/\?/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("a broad search with nothing to show says there is nothing available", () => {
    expect(fastPathRentalSummary(0, 0, { generic: true })).toMatch(/no verified rentals are available right now/i);
  });

  it("a specific search with no match does not imply the whole marketplace is empty", () => {
    const text = fastPathRentalSummary(0, 0, { generic: false });
    expect(text).toMatch(/no verified rentals match that search/i);
    expect(text).not.toMatch(/available right now/i);
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
    expect(text).toMatch(/not (yet )?(applied|filtered)|isn't (applied|filtered)/i);
  });

  it("budget note also accompanies an empty answer without implying budget caused it", () => {
    const text = fastPathRentalSummary(0, 0, { budgetNotApplied: true });
    expect(text).toMatch(/no verified rentals/i);
    expect(text).toMatch(/budget/i);
    expect(text).toMatch(/not (yet )?(applied|filtered)|isn.t (applied|filtered)/i);
    expect(text).not.toMatch(/wider budget/i);
  });
});
