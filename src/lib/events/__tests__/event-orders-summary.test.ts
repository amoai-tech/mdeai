import { describe, expect, it } from "vitest";
import { summarizeEventOrders } from "../event-orders-summary";

const row = (status: string, total_cents: number | null, quantity = 1) => ({
  status,
  total_cents,
  quantity,
});

describe("summarizeEventOrders", () => {
  it("counts only paid and partially refunded money as revenue", () => {
    const summary = summarizeEventOrders([
      row("paid", 4_000_000, 2),
      row("partial_refund", 1_000_000, 1),
      row("pending", 4_000_000, 1),
      row("refunded", 4_000_000, 1),
      row("cancelled", 4_000_000, 1),
    ]);

    expect(summary.revenueCents).toBe(5_000_000);
    expect(summary.ticketsSold).toBe(2); // paid rows only, never pending holds
    expect(summary.orderCount).toBe(5);
    expect(summary.buckets.pending.count).toBe(1);
    expect(summary.buckets.refunded.count).toBe(1);
    expect(summary.buckets.cancelled.count).toBe(1);
    // Gross partial-refund amounts are not proof of net money retained.
    expect(summary.complete).toBe(false);
  });

  it("keeps an unknown status out of revenue instead of guessing", () => {
    const summary = summarizeEventOrders([row("disputed", 9_999_999, 3)]);
    expect(summary.buckets.other.count).toBe(1);
    expect(summary.revenueCents).toBe(0);
    expect(summary.ticketsSold).toBe(0);
  });

  it("marks the summary incomplete when an amount is missing", () => {
    const summary = summarizeEventOrders([row("paid", 4_000_000, 1), row("paid", null, 1)]);
    expect(summary.complete).toBe(false);
    expect(summary.revenueCents).toBe(4_000_000);
    expect(summary.buckets.paid.count).toBe(2);
  });

  it("does not claim exact net revenue for a partial refund without refund amount", () => {
    const summary = summarizeEventOrders([row("paid", 600, 1), row("partial_refund", 500, 1)]);
    expect(summary.complete).toBe(false);
  });

  it("handles an empty event honestly", () => {
    const summary = summarizeEventOrders([]);
    expect(summary.orderCount).toBe(0);
    expect(summary.revenueCents).toBe(0);
    expect(summary.complete).toBe(true);
  });

  it("treats a null status as unknown rather than paid", () => {
    const summary = summarizeEventOrders([{ status: null, total_cents: 500, quantity: 1 }]);
    expect(summary.buckets.other.count).toBe(1);
    expect(summary.revenueCents).toBe(0);
  });
});
