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
});
