import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { leads, limiter, auth, serviceAvailable, insertCount } = vi.hoisted(() => ({
  leads: new Map<string, { id: string; metadata: Record<string, unknown> }>(),
  limiter: vi.fn(),
  auth: vi.fn(),
  serviceAvailable: { value: true },
  insertCount: { value: 0 },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: auth } }),
}));
vi.mock("@/lib/distributed-rate-limit", () => ({
  clientIpFromRequest: () => "127.0.0.1",
  checkRateLimitDurable: limiter,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () =>
    serviceAvailable.value
      ? {
          from: () => ({
            select: () => ({
              eq: (_col: string, id: string) => ({
                maybeSingle: async () => ({ data: leads.get(id) ?? null, error: null }),
              }),
            }),
            insert: (row: { id: string; intent: string; metadata: Record<string, unknown> }) => ({
              select: () => ({
                single: async () => {
                  insertCount.value++;
                  if (row.intent !== "host") throw new Error("Wrong CRM intent");
                  if (leads.has(row.id)) return { data: null, error: { code: "23505" } };
                  leads.set(row.id, { id: row.id, metadata: row.metadata });
                  return { data: { id: row.id }, error: null };
                },
              }),
            }),
          }),
        }
      : null,
}));

import { POST } from "./route";

const payload = {
  requestId: "46ea2a21-795d-4c64-a58f-e1d87fd941c3",
  name: "Ana Café",
  email: "ana@example.invalid",
  venueName: "Café Central",
  venueType: "cafe",
  message: "I run a café in Laureles.",
  variant: "cafe",
};

function post(value: unknown) {
  return POST(
    new Request("http://localhost/api/partners/venue-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    }),
  );
}

describe("SAN-882 venue leads", () => {
  beforeEach(() => {
    leads.clear();
    insertCount.value = 0;
    serviceAvailable.value = true;
    auth.mockReset().mockResolvedValue({ data: { user: null } });
    limiter.mockReset().mockResolvedValue({
      allowed: true,
      storeAvailable: true,
      count: 1,
      max: 12,
      retryAfterSeconds: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists one guest lead keyed by the request id", async () => {
    const response = await post(payload);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      leadId: payload.requestId,
      replayed: false,
      message: "Thanks — we'll be in touch within 1 business day.",
    });
    expect(leads.size).toBe(1);
    expect(leads.get(payload.requestId)?.metadata).toMatchObject({
      source_page: "venues-landing",
      venue_type: "cafe",
    });
  });

  it("replaying the identical request never performs a second insert", async () => {
    await post(payload);
    const replay = await post(payload);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      leadId: payload.requestId,
      replayed: true,
    });
    expect(insertCount.value).toBe(1);
    expect(leads.size).toBe(1);
  });

  it("rejects changed contents for the same request id", async () => {
    await post(payload);
    const conflict = await post({ ...payload, message: "Different inquiry contents." });
    expect(conflict.status).toBe(409);
    expect(leads.size).toBe(1);
  });

  it("rejects malformed input before database access", async () => {
    const response = await post({ ...payload, email: "not an email" });
    expect(response.status).toBe(400);
    expect(insertCount.value).toBe(0);
  });

  it("rejects guest spam once the durable limiter denies", async () => {
    limiter.mockResolvedValue({ allowed: false, storeAvailable: true });
    expect((await post(payload)).status).toBe(429);
    expect(leads.size).toBe(0);
  });

  it("fails closed when durable spam protection is offline", async () => {
    limiter.mockResolvedValue({ allowed: true, storeAvailable: false });
    expect((await post(payload)).status).toBe(503);
    expect(leads.size).toBe(0);
  });

  it("does not claim success when the database client is unavailable", async () => {
    serviceAvailable.value = false;
    expect((await post(payload)).status).toBe(503);
    expect(leads.size).toBe(0);
  });

  it("supports authenticated submissions and never logs the email", async () => {
    auth.mockResolvedValue({ data: { user: { id: "c132f270-61ca-4bf6-86a4-5033c21d0804" } } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await post(payload);
    expect(response.status).toBe(200);
    expect(leads.size).toBe(1);
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).not.toContain(payload.email);
    expect(logged).not.toContain(payload.name);
    expect(logged).not.toContain(payload.message);
  });
});
