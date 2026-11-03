import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEventCommerce } from "../load-event-commerce";

function stubCommerce(orders: Array<Record<string, unknown>>) {
  let requestedLimit = -1;
  const supabase = {
    from: (table: string) => {
      if (table === "events") return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "event-a", name: "Test event", status: "draft" }, error: null,
              }),
            }),
          }),
        }),
      };
      if (table === "event_tickets") return {
        select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
      };
      if (table === "event_orders") return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async (limit: number) => {
                requestedLimit = limit;
                return { data: orders.slice(0, limit), error: null };
              },
            }),
          }),
        }),
      };
      throw new Error("Unexpected table: " + table);
    },
    rpc: async () => ({ data: { kpis: { tickets_sold: 0, checked_in: 0 } }, error: null }),
  };

  return {
    load: () => loadEventCommerce(supabase as unknown as SupabaseClient, "organizer-a", "event-a"),
    getLimit: () => requestedLimit,
  };
}

const order = (index: number, total_cents: number | null) => ({
  id: String(index),
  short_id: String(index),
  status: "paid",
  total_cents,
  quantity: 1,
  currency: "COP",
  created_at: "2026-10-26T00:00:00Z",
  buyer_name: null,
  buyer_email: null,
});

describe("event commerce truthful sales totals", () => {
  it("keeps a missing order amount missing, not a completed zero", async () => {
    const result = await stubCommerce([order(1, null)]).load();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.commerce.summary.complete).toBe(false);
    expect(result.commerce.orders[0].total_cents).toBeNull();
  });

  it("marks 201+ orders as truncated instead of presenting 200 as lifetime revenue", async () => {
    const fixture = stubCommerce(Array.from({ length: 201 }, (_, i) => order(i, 100)));
    const result = await fixture.load();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(fixture.getLimit()).toBe(201);
    expect(result.commerce.orders).toHaveLength(200);
    expect(result.commerce.summary.complete).toBe(false);
  });

  it("reports exact totals for an event with fewer than 200 orders", async () => {
    const fixture = stubCommerce([order(1, 400), order(2, 200)]);
    const result = await fixture.load();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.commerce.summary.revenueCents).toBe(600);
    expect(result.commerce.summary.complete).toBe(true);
  });
});
