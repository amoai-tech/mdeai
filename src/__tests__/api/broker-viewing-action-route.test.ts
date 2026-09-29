/**
 * SAN-1206 · route-level tests for PATCH /api/host/rentals/viewings/[id]
 *
 * The route is a public API surface, so these tests pin the two things a caller can get wrong:
 * what it refuses before reaching the database, and what it actually sends when it does.
 *
 * The database is mocked. That is deliberate: the authorization and transition rules are proven
 * against a real Postgres in supabase/tests/database/san1206_broker_viewing_actions_test.sql.
 * What is proven here is the HTTP contract and the Medellín wall-clock conversion, which the
 * database cannot see because it never receives a `datetime-local` value.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const SHOWING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORIGINAL_INSTANT = "2099-11-20T19:00:00.000Z";

type RpcCall = { fn: string; args: Record<string, unknown> };
type RpcResponse = { data: unknown; error: { message: string; code?: string } | null };

const state = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  rpcResponse: {
    data: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "confirmed",
      scheduled_at: "2099-11-20T19:00:00.000Z",
      updated_at: "2026-09-29T12:00:00.000Z",
    },
    error: null,
  } as RpcResponse,
  calls: [] as RpcCall[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args });
      return state.rpcResponse;
    },
  }),
}));

import { PATCH } from "@/app/api/host/rentals/viewings/[id]/route";

function patch(body: unknown, showingId = SHOWING_ID) {
  return PATCH(
    new Request(`http://localhost/api/host/rentals/viewings/${showingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: showingId }) },
  );
}

/** The body every action asserts against the locked row in the database. */
function expectation(overrides: Record<string, unknown> = {}) {
  return {
    expectedStatus: "scheduled",
    expectedScheduledAt: ORIGINAL_INSTANT,
    ...overrides,
  };
}

describe("PATCH /api/host/rentals/viewings/[id] — SAN-1206", () => {
  beforeEach(() => {
    state.user = { id: "11111111-1111-4111-8111-111111111111" };
    state.calls.length = 0;
    state.rpcResponse = {
      data: {
        id: SHOWING_ID,
        status: "confirmed",
        scheduled_at: ORIGINAL_INSTANT,
        updated_at: "2026-09-29T12:00:00.000Z",
      },
      error: null,
    };
  });

  describe("refusals that must not reach the database", () => {
    it("401s an unauthenticated caller without calling the RPC", async () => {
      state.user = null;
      const response = await patch({ action: "confirm", ...expectation() });

      expect(response.status).toBe(401);
      expect(state.calls).toHaveLength(0);
    });

    it("400s a malformed showing id without calling the RPC", async () => {
      const response = await patch({ action: "confirm", ...expectation() }, "not-a-uuid");

      expect(response.status).toBe(400);
      expect(state.calls).toHaveLength(0);
    });

    it("400s a body that is not JSON", async () => {
      const response = await patch("{not json");

      expect(response.status).toBe(400);
      expect(state.calls).toHaveLength(0);
    });

    it("400s an action the database does not implement", async () => {
      const response = await patch({ action: "complete", ...expectation() });

      expect(response.status).toBe(400);
      expect(state.calls).toHaveLength(0);
    });

    it("400s a status outside the persisted vocabulary", async () => {
      const response = await patch({
        action: "confirm",
        ...expectation({ expectedStatus: "pending" }),
      });

      expect(response.status).toBe(400);
      expect(state.calls).toHaveLength(0);
    });

    it("400s an expectation that is not a parseable instant", async () => {
      const response = await patch({
        action: "confirm",
        ...expectation({ expectedScheduledAt: "yesterday-ish" }),
      });

      expect(response.status).toBe(400);
      expect(state.calls).toHaveLength(0);
    });
  });

  describe("reschedule input", () => {
    it("400s a reschedule with no new wall clock", async () => {
      const response = await patch({ action: "reschedule", ...expectation() });

      expect(response.status).toBe(400);
      expect(state.calls).toHaveLength(0);
    });

    it("400s a wall clock that is not a valid listing-local time", async () => {
      const response = await patch({
        action: "reschedule",
        ...expectation(),
        newWallClock: "2099-02-30T15:00",
      });

      expect(response.status).toBe(400);
      expect(state.calls).toHaveLength(0);
    });

    it("400s a reschedule into the past", async () => {
      const response = await patch({
        action: "reschedule",
        ...expectation(),
        newWallClock: "2020-01-01T12:00",
      });

      expect(response.status).toBe(400);
      expect(state.calls).toHaveLength(0);
    });

    // The load-bearing timezone test. A broker in Medellín types 3:00 PM into a
    // `datetime-local` control, which sends "2099-11-21T15:00" with no offset. Medellín is
    // UTC-5, so the database must receive 20:00Z. If the route ever passes the wall clock
    // through unchanged, or resolves it in the browser/server timezone, the viewing is booked
    // at the wrong hour and nobody notices until the renter arrives.
    it("resolves a Medellín wall clock to the canonical UTC instant", async () => {
      const response = await patch({
        action: "reschedule",
        ...expectation(),
        newWallClock: "2099-11-21T15:00",
      });

      expect(response.status).toBe(200);
      expect(state.calls).toHaveLength(1);
      expect(state.calls[0].args.p_new_scheduled_at).toBe("2099-11-21T20:00:00.000Z");
    });

    it("keeps the same hour meaning regardless of the process timezone", async () => {
      const original = process.env.TZ;
      try {
        // Prove the premise before relying on it. If the runtime ignores a mid-process TZ
        // change, this test would still pass while exercising nothing — a check that cannot
        // fail. Tokyo is UTC+9 and the listing zone is UTC-5, so the offsets must differ.
        const baselineOffset = new Date("2099-11-21T15:00").getTimezoneOffset();
        process.env.TZ = "Asia/Tokyo";
        const tokyoOffset = new Date("2099-11-21T15:00").getTimezoneOffset();

        expect(
          tokyoOffset,
          "the TZ change must take effect, or this test proves nothing",
        ).toBe(-540);
        expect(tokyoOffset).not.toBe(baselineOffset);

        const response = await patch({
          action: "reschedule",
          ...expectation(),
          newWallClock: "2099-11-21T15:00",
        });

        expect(response.status).toBe(200);
        expect(state.calls[0].args.p_new_scheduled_at).toBe("2099-11-21T20:00:00.000Z");
      } finally {
        process.env.TZ = original;
      }
    });
  });

  describe("the RPC call", () => {
    it("sends the caller's expectation so the database can refuse a stale action", async () => {
      await patch({ action: "confirm", ...expectation() });

      expect(state.calls).toHaveLength(1);
      expect(state.calls[0].fn).toBe("p1_broker_update_showing");
      expect(state.calls[0].args).toMatchObject({
        p_showing_id: SHOWING_ID,
        p_action: "confirm",
        p_expected_status: "scheduled",
        p_expected_scheduled_at: ORIGINAL_INSTANT,
      });
    });

    // Omitting the argument lets Postgres apply the parameter's own DEFAULT NULL. Sending an
    // explicit null happens to work today but silently breaks if that default ever changes.
    it("omits the new time for confirm rather than sending null", async () => {
      await patch({ action: "confirm", ...expectation() });

      expect(state.calls[0].args.p_new_scheduled_at).toBeUndefined();
    });

    it("omits the new time for cancel", async () => {
      await patch({ action: "cancel", ...expectation() });

      expect(state.calls[0].args.p_new_scheduled_at).toBeUndefined();
    });
  });

  describe("database refusals map to the documented HTTP statuses", () => {
    it.each([
      ["PT409", 409],
      ["42501", 403],
      ["PT404", 404],
      ["22023", 400],
      ["XX000", 500],
    ] as const)("maps %s to %i", async (code, expectedStatus) => {
      state.rpcResponse = {
        data: null,
        error: { message: `database said ${code}`, code },
      };

      const response = await patch({ action: "confirm", ...expectation() });

      expect(response.status).toBe(expectedStatus);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining(code),
      });
    });

    // The database is the authority on why a transition was refused, so a SQLSTATE that is
    // present must decide the status by itself. An earlier revision OR'd the code and message
    // checks with a bare `/cannot be/` pattern and listed the 409 branch first, so a genuine
    // 42501 whose prose contained those words answered 409 — telling the broker to refresh a
    // page that was never stale, instead of surfacing a refusal.
    it("lets a present SQLSTATE win over a misleading message", async () => {
      state.rpcResponse = {
        data: null,
        error: { message: "a scheduled viewing cannot be completed", code: "42501" },
      };

      const response = await patch({ action: "confirm", ...expectation() });

      expect(response.status).toBe(403);
    });

    // No code at all means the message is the only signal available, and the narrow patterns
    // still classify the documented refusals.
    it("falls back to the message when no SQLSTATE reached the server", async () => {
      state.rpcResponse = {
        data: null,
        error: { message: "showing changed since it was loaded (status confirmed)" },
      };

      const response = await patch({ action: "confirm", ...expectation() });

      expect(response.status).toBe(409);
    });

    it("does not classify an unanchored phrase as a conflict", async () => {
      // The removed `/cannot be/` pattern matched this and produced a 409 for an unknown error.
      state.rpcResponse = {
        data: null,
        error: { message: "upstream request cannot be satisfied right now" },
      };

      const response = await patch({ action: "confirm", ...expectation() });

      expect(response.status).toBe(500);
    });

    it("500s an RPC payload that is not the canonical showing", async () => {
      state.rpcResponse = { data: { unexpected: true }, error: null };

      const response = await patch({ action: "confirm", ...expectation() });

      expect(response.status).toBe(500);
    });
  });

  describe("success", () => {
    it("returns the canonical showing the database committed", async () => {
      const response = await patch({ action: "confirm", ...expectation() });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        showing: {
          showingId: SHOWING_ID,
          status: "confirmed",
          scheduledAt: ORIGINAL_INSTANT,
          updatedAt: "2026-09-29T12:00:00.000Z",
        },
      });
    });
  });
});
