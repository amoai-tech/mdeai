import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: { id: "host-a" } as { id: string } | null,
  attendee: null as null | { id: string; event_id: string },
  records: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({
    auth: { getUser: () => Promise.resolve({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: EVENT_ID, organizer_id: "host-a" }, error: null }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: false, error: null }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: state.attendee, error: null }),
        }),
      }),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      state.records.push({ name, args });
      return Promise.resolve({ data: name === "ticket_validate_consume" ? { result: "consumed" } : "log-id", error: null });
    },
  }),
}));
import { POST } from "@/app/api/tickets/validate/route";
function scan() {
  return POST(new Request("http://localhost/api/tickets/validate", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId: EVENT_ID, token: "random-invalid-token" }),
  }));
}
beforeEach(() => {
  state.user = { id: "host-a" };
  state.attendee = null;
  state.records.length = 0;
});
describe("ticket scan rejection audit", () => {
  it("persists unknown token without inventing attendee identity", async () => {
    expect((await scan()).status).toBe(404);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]).toMatchObject({
      name: "record_check_in",
      args: { p_event_id: EVENT_ID, p_attendee_id: null, p_scanned_by: "host-a", p_result: "unknown_token" },
    });
  });
  it("records wrong event without consuming or linking a foreign attendee id", async () => {
    state.attendee = { id: "foreign-attendee", event_id: "22222222-2222-4222-8222-222222222222" };
    expect((await scan()).status).toBe(409);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]).toMatchObject({
      name: "record_check_in",
      args: { p_event_id: EVENT_ID, p_attendee_id: null, p_result: "wrong_event" },
    });
  });
  it("rejects guests before touching the privileged scanner client", async () => {
    state.user = null;
    expect((await scan()).status).toBe(401);
    expect(state.records).toHaveLength(0);
  });
});
