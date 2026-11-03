import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  gate: { status: "ok", userId: "trusted-admin" } as
    | { status: "ok"; userId: string }
    | { status: "denied"; userId: string }
    | { status: "guest" },
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  response: { data: { status: "published", audit_id: "audit-row" } as Record<string, unknown> | null, error: null as null | { message: string; code?: string } },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/admin-gate", () => ({ getAdminGate: () => Promise.resolve(state.gate) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({
    rpc: (name: string, args: Record<string, unknown>) => {
      state.calls.push({ name, args });
      return Promise.resolve(state.response);
    },
  }),
}));

import { setAdminEventState } from "@/app/app/admin/events/actions";
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  state.gate = { status: "ok", userId: "trusted-admin" };
  state.response = { data: { status: "published", audit_id: "audit-row" }, error: null };
  state.calls = [];
});
describe("admin event state action", () => {
  it("updates through the single authenticated and audited RPC", async () => {
    expect(await setAdminEventState(EVENT_ID, "publish")).toEqual({ ok: true, status: "published" });
    expect(state.calls).toEqual([{ name: "admin_event_set_state", args: { p_event_id: EVENT_ID, p_action: "publish" } }]);
  });
  it("rejects ordinary signed-in accounts before touching database", async () => {
    state.gate = { status: "denied", userId: "outsider" };
    expect(await setAdminEventState(EVENT_ID, "unpublish")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(state.calls).toEqual([]);
  });
  it("rejects guests before touching database", async () => {
    state.gate = { status: "guest" };
    expect(await setAdminEventState(EVENT_ID, "restore")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(state.calls).toEqual([]);
  });
  it("rejects invalid actor-provided ids and actions", async () => {
    expect(await setAdminEventState("not-uuid", "publish")).toMatchObject({ code: "INVALID" });
    expect(await setAdminEventState(EVENT_ID, "delete" as "publish")).toMatchObject({ code: "INVALID" });
    expect(state.calls).toEqual([]);
  });
  it("never displays saved before the audit id is returned", async () => {
    state.response = { data: { status: "published" }, error: null };
    expect(await setAdminEventState(EVENT_ID, "publish")).toMatchObject({ ok: false, code: "FAILED" });
  });
  it("reports failed audit database transaction as unsuccessful", async () => {
    state.response = { data: null, error: { code: "23514", message: "audit rejected" } };
    expect(await setAdminEventState(EVENT_ID, "publish")).toMatchObject({ ok: false, code: "FAILED" });
  });
});
