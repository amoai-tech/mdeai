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
    expect(statesTicketCount("Total tickets: 2", 2)).toBe(true);
    expect(statesTicketCount("a total of 2 tickets", 2)).toBe(true);
    expect(statesTicketCount("Tickets - 2", 2)).toBe(true);
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
    expect(statesTicketCount("You sold a total of 2 tickets. Tickets sold: 3.", 3)).toBe(false);
  });

  it("treats unsold tickets as inventory, not as sales", () => {
    // A truthful answer may state both: "2 tickets sold, 8 tickets unsold".
    expect(statesTicketCount("2 tickets sold, 8 tickets unsold", 2)).toBe(true);
    expect(statesTicketCount("You sold 2 tickets. 8 tickets unsold.", 2)).toBe(true);
    expect(statesTicketCount("8 tickets unsold", 2)).toBe(false);
  });

  it("treats 'not sold' and 'not yet sold' as inventory too", () => {
    expect(statesTicketCount("2 tickets sold, 8 tickets not sold", 2)).toBe(true);
    expect(statesTicketCount("You sold 2 tickets. 8 tickets not yet sold.", 2)).toBe(true);
    expect(statesTicketCount("8 tickets not sold", 2)).toBe(false);
  });

  it("never accepts a comma-formatted amount as a partial ticket count", () => {
    // "1,800" must not be read as 1: a revenue figure is not a ticket count.
    expect(statesTicketCount("Tickets sold: 1,800", 1)).toBe(false);
    expect(statesTicketCount("Tickets sold: 1,800", 2)).toBe(false);
    expect(statesTicketCount("Tickets: 1,800", 1)).toBe(false);
    expect(statesTicketCount("You sold 1,800 tickets", 1)).toBe(false);
    expect(statesTicketCount("Sold: 1,800", 1)).toBe(false);
    expect(statesTicketCount("1,800 tickets sold", 1)).toBe(false);
    // Unformatted counts keep working in every supported shape.
    expect(statesTicketCount("2 tickets sold", 2)).toBe(true);
    expect(statesTicketCount("Tickets sold: 2", 2)).toBe(true);
    expect(statesTicketCount("Tickets: 2", 2)).toBe(true);
  });

  it("rejects a missing count and an invalid expectation", () => {
    expect(statesTicketCount("No sales yet for this event.", 2)).toBe(false);
    expect(statesTicketCount("2 tickets", Number.NaN)).toBe(false);
    expect(statesTicketCount("2 tickets", -1)).toBe(false);
  });

  it("accepts sold quantities alongside truthful remaining and capacity figures", () => {
    for (const reply of [
      "2 tickets sold, 8 tickets remaining.",
      "Capacity: 10 tickets. Sold: 2 tickets.",
      "2 tickets sold out of 10 tickets available.",
      "Tickets sold: 2. Total capacity: 10 tickets; 8 tickets left.",
      "Tickets sold: 2. Ticket 1: General Admission.",
      "2 sold, 8 tickets remaining.",
      "2 tickets sold out of 10 tickets.",
      "2 tickets sold; 8 tickets still available.",
      "Tickets sold: 2. Total tickets: 10.",
      "2 tickets sold of 10 tickets.",
      "Tickets sold: 2. Sell-through 20% (2 of 10 tickets).",
      "2 tickets sold. Event is at 20 % sell-through (2 of 10 tickets).",
      "Tickets sold: 2. Out of 10 tickets total.",
    ]) {
      expect(statesTicketCount(reply, 2), reply).toBe(true);
    }
  });

  it("rejects contradictory sold figures even when remaining inventory is correct", () => {
    for (const reply of [
      "20 tickets sold. Actually, 2 tickets sold. 8 tickets remaining.",
      "Tickets sold: 2, but 12 tickets were sold.",
      "Sold: 3 tickets; 2 tickets sold. Capacity: 10 tickets.",
    ]) {
      expect(statesTicketCount(reply, 2), reply).toBe(false);
    }
  });

  it("does not mistake remaining quantities or numbered tiers for sold totals", () => {
    expect(statesTicketCount("8 tickets remaining. Capacity: 10 tickets.", 8)).toBe(false);
    expect(statesTicketCount("Ticket 1: General Admission", 1)).toBe(false);
    expect(statesTicketCount("Remaining tickets: 8. Capacity: 10.", 8)).toBe(false);
    expect(statesTicketCount("Available tickets: 10.", 10)).toBe(false);
    expect(statesTicketCount("Capacity tickets: 10.", 10)).toBe(false);
    expect(statesTicketCount("Total capacity: 10 tickets.", 10)).toBe(false);
    expect(statesTicketCount("Tickets sold: 2. Total tickets: 10.", 2)).toBe(true);
  });

  it("does not misread the revenue amount as tickets sold across a line break", () => {
    const liveReply = "Total revenue: COP\u202f1,800\nTickets sold: 2\nPaid orders: 1";
    expect(statesTicketCount(liveReply, 2)).toBe(true);
    expect(statesTicketCount("Total revenue: COP 1,800\n2 tickets sold", 2)).toBe(true);
    expect(statesTicketCount("Revenue: COP 1,800\nTickets: 2", 2)).toBe(true);
  });

  it("rejects unlabeled conflicting ticket counts alongside explicitly sold counts", () => {
    expect(statesTicketCount("You sold 2 tickets. Tickets: 20", 2)).toBe(false);
    expect(statesTicketCount("Tickets sold: 2; tickets: 12", 2)).toBe(false);
  });

  it("accepts a sold label split from its count by one newline or thin space", () => {
    expect(statesTicketCount("Tickets sold:\n2", 2)).toBe(true);
    expect(statesTicketCount("Tickets sold:\u20092", 2)).toBe(true);
  });

  it("does not split currency thousands digits into a false ticket count", () => {
    expect(statesTicketCount("Revenue: COP 1,800 Tickets: 2", 2)).toBe(true);
    expect(statesTicketCount("Revenue: COP 1,800 Tickets sold: 2", 2)).toBe(true);
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
