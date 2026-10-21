import { describe, expect, it, vi } from "vitest";
import { loadPartnerProfile } from "../partner-profile-load";

function client(membershipResult: unknown, partnerResult?: unknown) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValueOnce(membershipResult)
    .mockResolvedValueOnce(partnerResult ?? { data: null, error: null });
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  };
  return { supabase, maybeSingle };
}

describe("loadPartnerProfile (SAN-814)", () => {
  it("returns error when the membership query fails", async () => {
    const { supabase } = client({ data: null, error: { code: "XX000" } });
    await expect(loadPartnerProfile(supabase as never, "user-1")).resolves.toEqual({
      status: "error",
    });
  });

  it("returns missing only when the query succeeded with no membership", async () => {
    const { supabase } = client({ data: null, error: null });
    await expect(loadPartnerProfile(supabase as never, "user-1")).resolves.toEqual({
      status: "missing",
    });
  });

  it("returns error when the partner query fails", async () => {
    const { supabase } = client(
      { data: { partner_id: "partner-1" }, error: null },
      { data: null, error: { code: "XX000" } },
    );
    await expect(loadPartnerProfile(supabase as never, "user-1")).resolves.toEqual({
      status: "error",
    });
  });

  it("returns the partner settings when both queries succeed", async () => {
    const { supabase } = client(
      { data: { partner_id: "partner-1" }, error: null },
      {
        data: {
          id: "partner-1",
          type: "restaurant",
          status: "draft",
          settings: { businessName: "Café Central" },
        },
        error: null,
      },
    );
    await expect(loadPartnerProfile(supabase as never, "user-1")).resolves.toEqual({
      status: "loaded",
      partner: {
        id: "partner-1",
        type: "restaurant",
        status: "draft",
        settings: { businessName: "Café Central" },
      },
    });
  });
});
