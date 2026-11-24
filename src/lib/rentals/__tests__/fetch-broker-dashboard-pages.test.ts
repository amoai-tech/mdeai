import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { fetchBrokerDashboard } from "../fetch-broker-dashboard";

const actor = "broker-a";
const now = "2026-11-24T15:00:00.000Z";
const todayAt = (hour: number) => new Date(Date.parse(now) + hour * 3_600_000).toISOString();

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
    const apartment = (i: number) => ({ id: `apt-${i}`, landlord_id: "profile-a", title: `Apartment ${i}`, neighborhood: "Laureles", listing_workflow_status: "published", bedrooms: 2 });
    const lead = (i: number) => ({ id: `lead-${i}`, apartment_id: `apt-${200 + i % 51}`, name: `Renter ${i}`, status: "new", created_at: now, last_contacted_at: null, apartment: { landlord_id: "profile-a", title: `Apartment ${200 + i % 51}` } });
    const showing = (i: number, scheduledAt = "2026-12-01T15:00:00Z") => ({ id: `show-${i}`, lead_id: `lead-${i}`, apartment_id: `apt-${200 + i % 51}`, scheduled_at: scheduledAt, created_at: now, status: "scheduled", apartment: { landlord_id: "profile-a", title: `Apartment ${200 + i % 51}`, neighborhood: "Laureles" } });
    let data: object[] = [];
    let total = 0;
    if (table === "landlord_profiles") {
      expect(q.get("user_id")).toBe("eq.broker-a");
      data = [{ id: "profile-a", display_name: "Broker A" }];
      total = 1;
    } else if (table === "apartments") {
      expect(q.get("landlord_id")).toBe("in.(profile-a)");
      if (method === "HEAD") {
        if (q.get("listing_workflow_status") === "eq.draft") total = 3;
        else if (q.get("or")?.includes("images")) total = 2;
        else if (q.has("or")) total = 1;
        else total = 251;
        data = [];
      } else {
        total = 251;
        data = rows(total, apartment).slice(offset, offset + limit);
      }
    } else {
      expect(q.get("apartment.landlord_id")).toBe("in.(profile-a)");
      expect(q.get("select")).toContain("!inner");
      if (table === "leads") {
        if (method === "HEAD") {
          const status = q.get("status") ?? "";
          if (status === "in.(new,contacted,qualified)") total = 12;
          else if (status === "in.(new)") total = 5;
          else if (q.has("created_at")) total = 42; // 30-day window
          else total = 76; // out-of-range inbox recovery
          data = [];
        } else if (q.has("id")) {
          const ids = new Set(q.get("id")?.slice(4, -1).split(","));
          total = ids.size;
          data = rows(76, lead).filter(row => ids.has((row as {id: string}).id));
        } else {
          total = 76;
          data = rows(total, lead);
          if (failInbox && q.get("select")?.includes("landlord_id,title")) return new Response(JSON.stringify({ message: "test failure" }), { status: 500 });
        }
      } else {
        const status = q.get("status") ?? "";
        const scheduledRanges = q.getAll("scheduled_at");
        if (method === "HEAD") {
          if (status === "in.(scheduled)") total = 1;
          else if (status === "in.(scheduled,confirmed)") total = 8;
          else total = 76;
          data = [];
        } else if (scheduledRanges.length === 2) {
          // Today's window: gte day start and lt day end.
          total = 2;
          data = [showing(0, todayAt(1)), showing(1, todayAt(4))];
        } else if (scheduledRanges.length === 1) {
          // Bounded after-today preview.
          total = 7;
          data = rows(5, (i) => showing(i, `2026-12-0${i + 1}T15:00:00Z`));
        } else {
          total = 76;
          data = rows(total, showing);
          if (status === "eq.scheduled") {
            expect(q.get("order")).toBe("scheduled_at.asc,id.asc");
          }
        }
      }
      data = method === "HEAD" ? [] : data.slice(offset, offset + limit);
    }
    if (method === "GET" && offset > 0 && offset >= total) {
      return new Response(JSON.stringify({ code: "PGRST103", message: "Requested range not satisfiable", details: null, hint: null }), {
        status: 416, headers: { "content-type": "application/json", "content-range": `*/${total}` },
      });
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

describe("SAN-1710 exact dashboard query contracts", () => {
  it("reads exact scoped totals for the four metrics, today and the after-today preview", async () => {
    const { client, calls } = fixture();
    const result = await fetchBrokerDashboard(client, actor);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.view.kpis.map((kpi) => kpi.value)).toEqual(["251", "12", "8", "2"]);
    expect(result.view.todaySchedule).toHaveLength(2);
    expect(result.view.todayTotal).toBe(2);
    expect(result.view.upcomingPreview).toHaveLength(5);
    expect(result.view.upcomingPreviewTotal).toBe(7);
    expect(result.view.attention.map((item) => item.title)).toEqual([
      "5 unanswered enquiries",
      "1 viewing request awaiting a decision",
      "Listings need attention",
    ]);
    expect(result.view.attention[2]?.detail).toBe("3 drafts · 2 without photos · 1 missing details");
    // The old published/7-day/avg-response queries are gone, not quietly reused.
    expect(calls.some((c) => c.url.searchParams.get("listing_workflow_status") === "eq.published")).toBe(false);
    expect(calls.some((c) => c.method === "HEAD" && c.url.pathname.endsWith("/leads") && c.url.searchParams.get("created_at")?.startsWith("gte."))).toBe(true);
  });

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
    expect(result.leadInbox).toMatchObject({ total: 76, offset: 25 });
    expect(result.leadInbox?.rows).toHaveLength(20);
    expect(calls.filter(c => c.url.pathname.endsWith("/landlord_profiles"))).toHaveLength(1);
    expect(calls.filter(c => c.url.pathname.endsWith("/apartments") && c.method === "GET")).toHaveLength(1);
    expect(calls.some(c => c.url.searchParams.get("offset") === "50" && c.url.searchParams.get("limit") === "20" && c.url.searchParams.get("order") === "created_at.desc,id.asc")).toBe(true);
    expect(calls.some(c => c.url.searchParams.get("offset") === "25" && c.url.searchParams.get("limit") === "20")).toBe(true);
  });

  it.each([76, 100])("recovers both out-of-range pages at offset %i with scoped exact totals", async (offset) => {
    const { client, calls } = fixture();
    const result = await fetchBrokerDashboard(client, actor, { viewings: { offset }, leads: { offset } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.view.viewingRequests).toEqual([]);
    expect(result.view.viewingRequestsTotal).toBe(76);
    expect(result.view.viewingRequestsOffset).toBe(offset);
    expect(result.leadInbox).toEqual({ rows: [], total: 76, offset });
    for (const table of ["leads", "showings"]) {
      expect(calls.some(c => c.method === "HEAD" && c.url.pathname.endsWith(`/${table}`) &&
        c.url.searchParams.get("apartment.landlord_id") === "in.(profile-a)" &&
        !c.url.searchParams.has("created_at") && !c.url.searchParams.has("scheduled_at"))).toBe(true);
    }
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
