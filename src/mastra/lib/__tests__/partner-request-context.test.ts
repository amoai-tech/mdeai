import { describe, expect, it } from "vitest";
import { RequestContext } from "@mastra/core/request-context";

import {
  getPartnerRuntimeContext,
  loadPartnerRuntimeContext,
  PARTNER_CONTEXT_KEY,
  setPartnerRuntimeContext,
  type PartnerRuntimeContext,
} from "../partner-request-context";

const context: PartnerRuntimeContext = {
  userId: "user-1",
  partnerId: "partner-1",
  partnerType: "venue",
  partnerStatus: "draft",
  role: "owner",
  businessName: "Café Central",
  category: "Café",
  neighborhood: "Laureles",
  website: "https://cafe.example.com",
  description: "Coffee and pastries",
};

function mockClient(
  memberships: Array<{ partner_id: string; role: string }> | null,
  partner: Record<string, unknown> | null,
  errors: { membership?: { code: string } | null; partner?: { code: string } | null } = {},
) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              if (table === "partner_members") {
                return Promise.resolve({
                  data: memberships,
                  error: errors.membership ?? null,
                });
              }
              return {
                maybeSingle: async () => ({
                  data: partner,
                  error: errors.partner ?? null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

describe("partner request context", () => {
  it("round-trips the signed-in partner context", () => {
    const rc = new RequestContext();
    setPartnerRuntimeContext(rc, context);
    expect(rc.get(PARTNER_CONTEXT_KEY)).toEqual(context);
    expect(getPartnerRuntimeContext(rc)).toEqual(context);
  });

  it("returns null when no partner context was set", () => {
    expect(getPartnerRuntimeContext(new RequestContext())).toBeNull();
  });

  it("loads the one membership with its saved profile through RLS", async () => {
    const supabase = mockClient(
      [{ partner_id: "partner-1", role: "owner" }],
      {
        id: "partner-1",
        type: "venue",
        status: "draft",
        settings: {
          businessName: "Café Central",
          category: "Café",
          neighborhood: "Laureles",
          website: "https://cafe.example.com",
          description: "Coffee and pastries",
        },
      },
    );

    await expect(
      loadPartnerRuntimeContext(supabase as never, "user-1"),
    ).resolves.toEqual(context);
  });

  it("requires an explicit selection when the user has multiple businesses", async () => {
    const memberships = [
      { partner_id: "partner-1", role: "owner" },
      { partner_id: "partner-2", role: "owner" },
    ];
    const partner = {
      id: "partner-2",
      type: "venue",
      status: "draft",
      settings: { businessName: "Second Café" },
    };

    await expect(
      loadPartnerRuntimeContext(mockClient(memberships, partner) as never, "user-1"),
    ).resolves.toBeNull();

    const selected = await loadPartnerRuntimeContext(
      mockClient(memberships, partner) as never,
      "user-1",
      "partner-2",
    );
    expect(selected?.partnerId).toBe("partner-2");
    expect(selected?.businessName).toBe("Second Café");
  });

  it("fails closed when the selected business is not a membership", async () => {
    await expect(
      loadPartnerRuntimeContext(
        mockClient([{ partner_id: "partner-1", role: "owner" }], null) as never,
        "user-1",
        "partner-2",
      ),
    ).resolves.toBeNull();
  });

  it("returns null for no membership or a membership query failure", async () => {
    await expect(
      loadPartnerRuntimeContext(mockClient([], null) as never, "user-1"),
    ).resolves.toBeNull();
    await expect(
      loadPartnerRuntimeContext(
        mockClient(null, null, { membership: { code: "XX000" } }) as never,
        "user-1",
      ),
    ).resolves.toBeNull();
  });
});
