/**
 * SAN-407 — search first, ask second. When a broad rental message reaches the AI agent (the
 * fast path declined it, or the message was sent before the page finished loading), the agent
 * must search with the renter's own words and offer at most one optional refinement AFTER the
 * results. It used to answer with the canned "What dates, budget, and setup…" question, which
 * is exactly what the renter-facing fast path no longer does.
 *
 * This pins the instruction text. It cannot prove how a live model behaves.
 */
import { describe, expect, it } from "vitest";
import { conciergeAgent } from "../concierge";
import { rentalAgent } from "../rental-agent";

async function instructionsOf(agent: { getInstructions: () => unknown }): Promise<string> {
  const value = await agent.getInstructions();
  return typeof value === "string" ? value : JSON.stringify(value);
}

describe.each([
  ["concierge", conciergeAgent],
  ["rental specialist", rentalAgent],
])("%s agent rental gate", (_name, agent) => {
  it("never tells the model to ask before searching", async () => {
    const text = await instructionsOf(agent as unknown as { getInstructions: () => unknown });
    expect(text).not.toMatch(/ask first/i);
    expect(text).not.toMatch(/What dates, budget, and setup are you looking for/i);
    expect(text).not.toMatch(/send exactly ONE grouped clarification, then search/i);
  });

  it("searches with the renter's own words, then offers one optional refinement after the results", async () => {
    const text = await instructionsOf(agent as unknown as { getInstructions: () => unknown });
    expect(text).toMatch(/still call search-rentals immediately/i);
    expect(text).toMatch(/nothing they did not say/i);
    expect(text).toMatch(/only AFTER the results/i);
    expect(text).toMatch(/Never ask before searching|Never block a search/i);
  });
});
