import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEventAttendees } from "./load-event-attendees";

const row = {
  id: "a", full_name: "Guest", email: "guest@example.invalid",
  status: "active", qr_used_at: null, tier_name: "GA",
  purchase_time: null, order_short_id: "A1",
};
function stub(data: unknown, rpcError: string | null = null, event: unknown = {
  id: "event-1", name: "Test concert", status: "published",
}) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: event, error: null }),
  };
  const rpc = vi.fn().mockResolvedValue({
    data, error: rpcError ? { message: rpcError } : null,
  });
  const client = {
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }),
    rpc,
  } as unknown as SupabaseClient;
  return { client, rpc, query };
}

describe("loadEventAttendees", () => {
  it("returns valid rows and a truthful count", async () => {
    const { client, rpc } = stub({ total: 1, rows: [row] });
    const result = await loadEventAttendees(client, "host-1", "event-1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("Expected attendee result");
    expect(result.attendees.rows).toEqual([row]);
    expect(result.attendees.total).toBe(1);
    expect(rpc).toHaveBeenCalledWith("event_attendees_paginated", {
      p_event_id: "event-1", p_search: "", p_limit: 50, p_offset: 0,
    });
  });
  it.each([null, {}, { total: 0 }, { total: 1, rows: null },
    { total: -1, rows: [] }, { total: "1", rows: [] },
    { total: 0, rows: [row] },
    { total: 1, rows: [{ ...row, id: 1 }] },
    { total: 1, rows: [{ id: "a" }] },
  ])("reports malformed RPC data as an error: %j", async (data) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await loadEventAttendees(stub(data).client, "host-1", "event-1")).status)
        .toBe("error");
    } finally { spy.mockRestore(); }
  });
  it("preserves genuinely empty attendee results", async () => {
    const result = await loadEventAttendees(stub({ total: 0, rows: [] }).client, "host-1", "event-1");
    expect(result.status).toBe("ok");
  });
  it("distinguishes a foreign or missing event", async () => {
    const { client, rpc } = stub({ total: 0, rows: [] }, null, null);
    expect((await loadEventAttendees(client, "outsider", "event-1")).status).toBe("not_found");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves RPC error state", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await loadEventAttendees(stub(null, "forbidden").client, "host-1", "event-1")).status)
        .toBe("error");
    } finally { spy.mockRestore(); }
  });
});
