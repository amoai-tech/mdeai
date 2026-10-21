import { describe, expect, it, vi } from "vitest";
import { loadPartnerProfile } from "../partner-profile-load";

const ONE = { id: "partner-1", type: "restaurant", status: "draft", settings: { businessName: "Café Central" } };
const TWO = { id: "partner-2", type: "nightlife", status: "active", settings: { businessName: "Club Sur" } };

function client(memberships: unknown, partners: unknown = { data: [ONE], error: null }) {
  const membershipQuery = { eq: vi.fn().mockResolvedValue(memberships) };
  const partnersQuery = { in: vi.fn().mockResolvedValue(partners) };
  const supabase = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => (table === "partner_members" ? membershipQuery : partnersQuery)),
    })),
  };
  return { supabase, membershipQuery, partnersQuery };
}

const membership = (ids: string[]) => ({
  data: ids.map((partner_id) => ({ partner_id })),
  error: null,
});

describe("loadPartnerProfile (SAN-814)", () => {
  it("distinguishes a query failure from missing membership", async () => {
    const failed = client({ data: null, error: { code: "XX000" } });
    expect(await loadPartnerProfile(failed.supabase as never, "user-1")).toEqual({ status: "error" });
    const absent = client(membership([]));
    expect(await loadPartnerProfile(absent.supabase as never, "user-1")).toEqual({ status: "missing" });
  });

  it("distinguishes a missing partner row from a successful lookup", async () => {
    const c = client(membership(["partner-1"]), { data: [], error: null });
    expect(await loadPartnerProfile(c.supabase as never, "user-1")).toEqual({ status: "error" });
  });

  it("automatically loads exactly one authorized partner", async () => {
    const c = client(membership(["partner-1"]));
    expect(await loadPartnerProfile(c.supabase as never, "user-1")).toEqual({
      status: "loaded", partner: ONE, options: [ONE],
    });
    expect(c.partnersQuery.in).toHaveBeenCalledWith("id", ["partner-1"]);
  });

  it("requires selection for multiple businesses and allows either membership", async () => {
    const c = client(membership(["partner-1", "partner-2"]), { data: [ONE, TWO], error: null });
    expect(await loadPartnerProfile(c.supabase as never, "user-1")).toEqual({
      status: "selection_required", options: [ONE, TWO],
    });
    expect((await loadPartnerProfile(c.supabase as never, "user-1", "partner-2")).status).toBe("loaded");
  });

  it("never queries an unauthorized selected partner", async () => {
    const c = client(membership(["partner-1"]));
    expect(await loadPartnerProfile(c.supabase as never, "user-1", "partner-attacker")).toEqual({
      status: "forbidden",
    });
    expect(c.partnersQuery.in).not.toHaveBeenCalled();
  });
});
