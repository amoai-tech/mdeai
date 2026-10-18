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
import { SCHEDULE_VIEWING_ERROR_MESSAGES } from "@/lib/leads/schedule-viewing-schema";

const FUTURE_WALL_CLOCK = "2099-06-01T15:00";

const fetchMock = vi.fn();

/**
 * The route is the last place upstream prose could reach a renter. These tests both assert
 * the safe copy and assert the technical detail survived in the server log, so the fix cannot
 * be "delete the detail" — it has to move it.
 */
const errorCalls: unknown[][] = [];

function serverLog(): string {
  return JSON.stringify(errorCalls);
}

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
  errorCalls.length = 0;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errorCalls.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
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
    expect(json.error.message).toBe(
      SCHEDULE_VIEWING_ERROR_MESSAGES.SHOWING_NOT_COMMITTED,
    );
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

  it("rejects a past viewing time before calling the edge, in renter language", async () => {
    const res = await post(validBody({ preferredAt: "2020-01-01T10:00" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    // The field name `preferredAt` never reaches the renter as the whole message.
    expect(json.error.message).toBe("Choose a viewing time in the future.");
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

  it("keeps the edge's technical validation prose out of the renter's response", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(400, {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "p1_schedule_tour_atomic: listing is not requestable",
        },
      }),
    );

    const res = await post(validBody());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe(SCHEDULE_VIEWING_ERROR_MESSAGES.VALIDATION_ERROR);
    // Whatever the renter would read — code, message, details — must not carry the SQL text.
    expect(JSON.stringify(json)).not.toContain("p1_schedule_tour_atomic");
    // …but the operator can still find it.
    expect(serverLog()).toContain("p1_schedule_tour_atomic");
  });

  it("does not downgrade a 5xx edge validation response to a client 400", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(500, {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "validation path failed upstream",
        },
      }),
    );

    const res = await post(validBody());
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe(SCHEDULE_VIEWING_ERROR_MESSAGES.VALIDATION_ERROR);
    expect(JSON.stringify(json)).not.toContain("validation path failed upstream");
    expect(serverLog()).toContain("validation path failed upstream");
  });

  it("maps a rate-limited edge response to a typed error", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(429, {
        success: false,
        error: { code: "RATE_LIMITED", message: "chat-lead-capture: per-IP limit 20/h" },
      }),
    );

    const res = await post(validBody());
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(json.error.message).toBe(SCHEDULE_VIEWING_ERROR_MESSAGES.RATE_LIMITED);
    expect(JSON.stringify(json)).not.toContain("per-IP limit");
    expect(serverLog()).toContain("per-IP limit");
  });

  it("answers a database failure with renter copy while logging the real cause", async () => {
    fetchMock.mockResolvedValue(
      edgeResponse(500, {
        success: false,
        error: {
          message:
            'duplicate key value violates unique constraint "leads_idempotency_key_key"',
        },
      }),
    );

    const res = await post(validBody());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe("UPSTREAM_ERROR");
    expect(json.error.message).toBe(SCHEDULE_VIEWING_ERROR_MESSAGES.UPSTREAM_ERROR);
    expect(json.error.message).not.toMatch(/duplicate key|constraint|postgres/i);
    expect(serverLog()).toContain("duplicate key value violates unique constraint");
  });

  it("never returns a message outside the shared safe copy", async () => {
    const cases: Array<{ status: number; payload: unknown }> = [
      {
        status: 400,
        payload: {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "p1_schedule_tour_atomic: no" },
        },
      },
      {
        status: 429,
        payload: { success: false, error: { message: "edge rate limiter tripped" } },
      },
      {
        status: 500,
        payload: { success: false, error: { message: "null value in column \"email\"" } },
      },
      { status: 200, payload: { success: true, data: { lead_id: "lead-1" } } },
    ];

    for (const { status, payload } of cases) {
      fetchMock.mockResolvedValueOnce(edgeResponse(status, payload));
      const res = await post(validBody());
      const json = await res.json();
      expect(Object.values(SCHEDULE_VIEWING_ERROR_MESSAGES)).toContain(json.error.message);
    }
  });
});
