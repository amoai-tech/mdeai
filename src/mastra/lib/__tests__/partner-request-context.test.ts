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
};

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

  it("loads only the membership row visible through the caller's Supabase client", async () => {
    const supabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () =>
                    table === "partner_members"
                      ? { data: { partner_id: "partner-1", role: "owner" }, error: null }
                      : {
                          data: {
                            id: "partner-1",
                            type: "venue",
                            status: "draft",
                            settings: {
                              businessName: "Café Central",
                              category: "Café",
                              neighborhood: "Laureles",
                            },
                          },
                          error: null,
                        },
                };
              },
            };
          },
        };
      },
    };

    const loaded = await loadPartnerRuntimeContext(supabase as never, "user-1");
    expect(loaded).toEqual(context);
  });

  it("returns null when the signed-in user has no partner membership", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq() {
                return { maybeSingle: async () => ({ data: null, error: null }) };
              },
            };
          },
        };
      },
    };
    await expect(loadPartnerRuntimeContext(supabase as never, "user-1")).resolves.toBeNull();
  });
});
