import { describe, expect, it } from "vitest";
import { statesTicketCount } from "./helpers/host-sales-wording";

describe("SAN-729 — a truthful Host sales answer is accepted in both word orders", () => {
  it("accepts the count before the word", () => {
    expect(statesTicketCount("You sold 2 tickets for this event.", 2)).toBe(true);
    expect(statesTicketCount("There is 2 ticket sold.", 2)).toBe(true);
  });

  it("accepts the count after the word", () => {
    expect(statesTicketCount("Tickets sold: 2. Paid orders: 1.", 2)).toBe(true);
    expect(statesTicketCount("Tickets: 2", 2)).toBe(true);
    expect(statesTicketCount("Total tickets - 2", 2)).toBe(true);
  });

  it("rejects a different count, including one that contains the digit", () => {
    for (const text of ["20 tickets", "12 tickets", "1 ticket", "Tickets sold: 20", "Tickets sold: 12", "Tickets sold: 1"]) {
      expect(statesTicketCount(text, 2)).toBe(false);
    }
  });

  it("does not count a bare number somewhere else in the reply", () => {
    expect(statesTicketCount("COP 1,800 in revenue across 2 orders.", 2)).toBe(false);
  });

  it("rejects a contradictory reply even when the expected count is present", () => {
    expect(statesTicketCount("20 tickets. 2 tickets.", 2)).toBe(false);
    expect(statesTicketCount("Tickets sold: 2, actually tickets sold: 12", 2)).toBe(false);
  });

  it("rejects a missing count and an invalid expectation", () => {
    expect(statesTicketCount("No sales yet for this event.", 2)).toBe(false);
    expect(statesTicketCount("2 tickets", Number.NaN)).toBe(false);
    expect(statesTicketCount("2 tickets", -1)).toBe(false);
  });

  it("handles long whitespace padding without backtracking", () => {
    const padded = `Tickets${" ".repeat(20_000)}sold: 2`;
    const started = Date.now();
    expect(statesTicketCount(padded, 2)).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
    // Normal formatting still passes.
    expect(statesTicketCount("Tickets   sold:  2", 2)).toBe(true);
  });
});
