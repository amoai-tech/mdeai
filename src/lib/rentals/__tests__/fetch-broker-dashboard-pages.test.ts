import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { fetchBrokerDashboard } from "../fetch-broker-dashboard";

const actor = "broker-a";
const now = "2026-11-24T15:00:00.000Z";
function fixture(failInbox = false) {
  const calls: Array<{ url: URL; method: string }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    const table = url.pathname.split("/").at(-1);
    const q = url.searchParams;
    const offset = Number(q.get("offset") ?? 0);
    const limit = Number(q.get("limit") ?? 1000);
    const rows = (n: number, make: (i: number) => object) => Array.from({ length: n }, (_, i) => make(i));
    const apartment = (i: number) => ({ id: `apt-${i}`, landlord_id: "profile-a", title: `Apartment ${i}`, listing_workflow_status: "published" });
    const lead = (i: number) => ({ id: `lead-${i}`, apartment_id: `apt-${200 + i % 51}`, name: `Renter ${i}`, status: "new", created_at: now, last_contacted_at: null, apartment: { landlord_id: "profile-a", title: `Apartment ${200 + i % 51}` } });
    const showing = (i: number) => ({ id: `show-${i}`, lead_id: `lead-${i}`, apartment_id: `apt-${200 + i % 51}`, scheduled_at: "2026-12-01T15:00:00Z", created_at: now, status: "scheduled", apartment: { landlord_id: "profile-a", title: `Apartment ${200 + i % 51}` } });
    let data: object[] = [];
    let total = 0;
    if (table === "landlord_profiles") {
      expect(q.get("user_id")).toBe("eq.broker-a");
      data = [{ id: "profile-a", display_name: "Broker A" }];
      total = 1;
    } else if (table === "apartments") {
      expect(q.get("landlord_id")).toBe("in.(profile-a)");
      total = 251;
      data = rows(total, apartment).slice(offset, offset + limit);
    } else {
      expect(q.get("apartment.landlord_id")).toBe("in.(profile-a)");
      expect(q.get("select")).toContain("!inner");
      if (table === "leads") {
        total = 76;
        data = rows(total, lead);
        if (q.has("id")) {
          const ids = new Set(q.get("id")?.slice(4, -1).split(","));
          data = data.filter(row => ids.has((row as {id: string}).id));
        }
        else if (failInbox && q.get("select")?.includes("landlord_id,title")) return new Response(JSON.stringify({ message: "test failure" }), { status: 500 });
      } else {
        total = 76;
        data = rows(total, showing);
        if (q.get("status") === "eq.scheduled") {
          expect(q.get("order")).toBe("scheduled_at.asc,id.asc");
        }
      }
      data = data.slice(offset, offset + limit);
    }
    return new Response(method === "HEAD" ? null : JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json", "content-range": `0-${Math.max(0, data.length - 1)}/${total}` },
    });
  });
  const client = createClient<Database>("https://example.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetch as unknown as typeof globalThis.fetch },
  });
  return { client, calls };
}

describe("SAN-1684 dashboard page query contracts", () => {
  it("requests bounded pages and exact totals over the existing FK-scoped REST API", async () => {
    const { client, calls } = fixture();
    const result = await fetchBrokerDashboard(client, actor, { viewings: { offset: 50, limit: 20 }, leads: { offset: 25, limit: 20 } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.inventory.total).toBe(251);
    expect(result.inventory.listings).toHaveLength(200);
    expect(result.view.viewingRequestsOffset).toBe(50);
    expect(result.view.viewingRequestsTotal).toBe(76);
    expect(result.view.viewingRequests).toHaveLength(20);
    expect(result.view.viewingRequests.every(row => row.apartmentTitle === row.apartmentId.replace("apt-", "Apartment "))).toBe(true);
    expect(result.view.viewingRequests.every(row => row.apartmentTitle?.startsWith("Apartment"))).toBe(true);
    expect(result.leadInbox).toMatchObject({ total: 76, offset: 25 });
    expect(result.leadInbox?.rows).toHaveLength(20);
    expect(result.view.attentionIsPartial).toBe(true);
    expect(calls.filter(c => c.url.pathname.endsWith("/landlord_profiles"))).toHaveLength(1);
    expect(calls.filter(c => c.url.pathname.endsWith("/apartments") && c.method === "GET")).toHaveLength(1);
    expect(calls.some(c => c.url.searchParams.get("offset") === "50" && c.url.searchParams.get("limit") === "20" && c.url.searchParams.get("order") === "created_at.desc,id.asc")).toBe(true);
    expect(calls.some(c => c.url.searchParams.get("offset") === "25" && c.url.searchParams.get("limit") === "20")).toBe(true);
  });

  it("does not prefetch an inbox when the default dashboard is requested", async () => {
    const { client, calls } = fixture();
    const result = await fetchBrokerDashboard(client, actor);
    expect(result.ok).toBe(true);
    expect(result.ok && result.leadInbox).toBeUndefined();
    expect(calls.some(c => c.url.pathname.endsWith("/leads") && c.url.searchParams.get("select")?.includes("landlord_id,title"))).toBe(false);
  });

  it("fails closed on an inbox error and rejects invalid pages before any read", async () => {
    const { client, calls } = fixture(true);
    expect(await fetchBrokerDashboard(client, actor, { leads: { limit: 101 } })).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await fetchBrokerDashboard(client, actor, { leads: { limit: 10 } })).toMatchObject({ ok: false });
    } finally { spy.mockRestore(); }
  });
});
