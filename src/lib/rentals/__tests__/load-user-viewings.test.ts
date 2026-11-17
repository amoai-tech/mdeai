import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, from, select, eq, order, limit } = vi.hoisted(() => ({
  createClient: vi.fn(), from: vi.fn(), select: vi.fn(),
  eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
import { loadUserViewings } from "../load-user-viewings";

describe("SAN-1426 · Rental Viewing Status — Let Renters Track and Respond to Viewing Updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({ from });
    from.mockReturnValue({ select });
    select.mockReturnValue({ eq });
    eq.mockReturnValue({ order });
    order.mockReturnValue({ limit });
    limit.mockResolvedValue({ data: [], error: null });
  });

  it("uses RLS-scoped showings and explicitly filters by the signed-in lead owner", async () => {
    const out = await loadUserViewings("user-a");
    expect(out).toEqual({ status: "ok", value: [] });
    expect(from).toHaveBeenCalledWith("showings");
    expect(select).toHaveBeenCalledWith(expect.stringContaining("leads!inner(user_id)"));
    expect(eq).toHaveBeenCalledWith("lead.user_id", "user-a");
    expect(order).toHaveBeenCalledWith("scheduled_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(50);
  });

  it("maps saved showing status and exact apartment identity without inventing broker claims", async () => {
    limit.mockResolvedValue({ data: [{
      id: "show-1", status: "scheduled",
      scheduled_at: "2026-11-19T20:00:00.000Z",
      apartment: { id: "apt-1", title: "Laureles studio", neighborhood: "Laureles" },
    }], error: null });
    expect(await loadUserViewings("user-a")).toEqual({ status: "ok", value: [{
      id: "show-1", apartmentId: "apt-1", apartmentTitle: "Laureles studio",
      neighborhood: "Laureles", status: "scheduled",
      scheduledAt: "2026-11-19T20:00:00.000Z",
    }] });
  });

  it("normalizes array-form foreign keys without guessing property details", async () => {
    limit.mockResolvedValue({ data: [{
      id: "show-2", status: "confirmed", scheduled_at: "2026-11-19T20:00:00Z",
      apartment: [{ id: "apt-2", title: "Real stored listing", neighborhood: "Envigado" }],
    }], error: null });
    const out = await loadUserViewings("user-a");
    expect(out.status).toBe("ok");
    if (out.status === "ok") expect(out.value[0]).toMatchObject({
      apartmentId: "apt-2", apartmentTitle: "Real stored listing", neighborhood: "Envigado",
    });
  });

  it("never treats a query failure as an empty personal account", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    limit.mockResolvedValue({ data: null, error: { code: "PGRST116", message: "not accessible" } });
    const out = await loadUserViewings("user-a");
    expect(out.status).toBe("error");
    expect(out).not.toHaveProperty("value");
    spy.mockRestore();
  });
});
