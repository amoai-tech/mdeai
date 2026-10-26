import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "host-a" } as { id: string } | null,
  attendee: null as null | { id: string; event_id: string },
  failAudit: false,
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
    rpc: (name: string, args: Record<string, unknown>) => {
      state.records.push({ name, args });
      if (state.failAudit) return Promise.resolve({ data: null, error: { message: "audit insert failed" } });
      const result = !state.attendee
        ? "unknown_token"
        : state.attendee.event_id !== EVENT_ID
          ? "wrong_event"
          : "consumed";
      return Promise.resolve({ data: { result }, error: null });
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
  state.failAudit = false;
  state.records.length = 0;
});
describe("atomic ticket validation and audit", () => {
  it("audits unknown code inside the single authorized RPC", async () => {
    expect((await scan()).status).toBe(404);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]).toMatchObject({ name: "ticket_validate_consume_audited",
      args: { p_event_id: EVENT_ID, p_scanned_by: "host-a" } });
  });
  it("rejects a foreign event without linking the foreign attendee", async () => {
    state.attendee = { id: "foreign-attendee", event_id: "22222222-2222-4222-8222-222222222222" };
    expect((await scan()).status).toBe(409);
    expect(state.records).toHaveLength(1);
  });
  it("returns a saved success only after the atomic RPC returns consumed", async () => {
    state.attendee = { id: "attendee-a", event_id: EVENT_ID };
    const response = await scan();
    expect(response.status).toBe(200);
    expect((await response.json()).result).toBe("consumed");
    expect(state.records).toHaveLength(1);
  });
  it("does not report admission if the database audit operation fails", async () => {
    state.attendee = { id: "attendee-a", event_id: EVENT_ID };
    state.failAudit = true;
    const response = await scan();
    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
    expect(state.records).toHaveLength(1);
  });
  it("rejects guests before creating the privileged client", async () => {
    state.user = null;
    expect((await scan()).status).toBe(401);
    expect(state.records).toHaveLength(0);
  });
});
