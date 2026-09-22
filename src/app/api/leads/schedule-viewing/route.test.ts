import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getSession } })),
}));

vi.mock("@/lib/supabase/edge-functions", () => ({
  getSupabaseFunctionsBaseUrl: () => "https://example.supabase.co/functions/v1",
  getSupabaseAnonAuthHeaders: () => ({ "Content-Type": "application/json" }),
}));

import { POST } from "./route";

const FUTURE_WALL_CLOCK = "2099-06-01T15:00";

const fetchMock = vi.fn();

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    listingId: "apt-laureles-001",
    listingTitle: "2BR Laureles Apartment",
    neighborhood: "Laureles",
    name: "Camila Test",
    email: "camila@example.com",
    preferredAt: FUTURE_WALL_CLOCK,
    ...overrides,
  };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/leads/schedule-viewing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function edgeResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response;
}

beforeEach(() => {
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: null } });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/leads/schedule-viewing (SAN-1203)", () => {
  it("returns both committed ids on success", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(200, {
        success: true,
        data: {
          lead_id: "lead-1",
          showing_id: "showing-1",
          actions: [{ payload: { message: "Viewing scheduled — the landlord will confirm your time slot." } }],
        },
      }),
    );

    const res = await post(validBody());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.leadId).toBe("lead-1");
    expect(json.showingId).toBe("showing-1");
  });

  it("fails closed when the edge commits a lead but no showing", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(200, {
        success: true,
        data: { lead_id: "lead-1", actions: [] },
      }),
    );

    const res = await post(validBody());
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("SHOWING_NOT_COMMITTED");
    expect(json.showingId).toBeUndefined();
  });

  it("fails closed when the edge commits a showing but no lead", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(200, { success: true, data: { showing_id: "showing-1" } }),
    );

    const res = await post(validBody());

    expect(res.status).toBe(502);
    expect((await res.json()).success).toBe(false);
  });

  it("rejects a missing viewing time before calling the edge", async () => {
    const res = await post(validBody({ preferredAt: undefined }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a past viewing time before calling the edge", async () => {
    const res = await post(validBody({ preferredAt: "2020-01-01T10:00" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed viewing time before calling the edge", async () => {
    const res = await post(validBody({ preferredAt: "next tuesday" }));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a canonical UTC instant, not the raw wall clock", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(200, {
        success: true,
        data: { lead_id: "lead-1", showing_id: "showing-1" },
      }),
    );

    await post(validBody());

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.preferred_at).toBe("2099-06-01T20:00:00.000Z");
  });

  it("derives the same idempotency key for equivalent wall clocks", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(200, {
        success: true,
        data: { lead_id: "lead-1", showing_id: "showing-1" },
      }),
    );

    await post(validBody({ preferredAt: "2099-06-01T15:00" }));
    await post(validBody({ preferredAt: "2099-06-01T15:00:00" }));

    const first = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(first.idempotency_key).toBe(second.idempotency_key);
  });

  it("changes the idempotency key when phone or trip identity changes", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(200, {
        success: true,
        data: { lead_id: "lead-1", showing_id: "showing-1" },
      }),
    );

    await post(validBody({ phone: "+573001111111" }));
    await post(validBody({ phone: "+573002222222" }));
    await post(validBody({
      phone: "+573001111111",
      tripId: "a2860000-0000-4000-8000-000000000002",
    }));

    const first = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const third = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(first.idempotency_key).not.toBe(second.idempotency_key);
    expect(first.idempotency_key).not.toBe(third.idempotency_key);
  });

  it("maps a rate-limited edge response to a typed error", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(429, {
        success: false,
        error: { message: "Too many submissions — try again later" },
      }),
    );

    const res = await post(validBody());

    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("RATE_LIMITED");
  });
});
