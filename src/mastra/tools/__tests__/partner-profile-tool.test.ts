import { describe, expect, it } from "vitest";
import { RequestContext } from "@mastra/core/request-context";

import { getPartnerProfileTool } from "../partner-profile-tool";
import { setPartnerRuntimeContext } from "../../lib/partner-request-context";

const base = {
  userId: "user-1",
  partnerId: "partner-1",
  partnerType: "venue",
  partnerStatus: "draft",
  role: "owner",
  businessName: "Café Central",
  category: null,
  neighborhood: "Laureles",
  website: null,
  description: "Coffee and pastries",
};

describe("getPartnerProfileTool (SAN-705)", () => {
  it("returns missing fields from the authorized request context", async () => {
    const rc = new RequestContext();
    setPartnerRuntimeContext(rc, base);

    const result = await getPartnerProfileTool.execute?.(
      {},
      { requestContext: rc } as never,
    );

    expect(result).toMatchObject({
      found: true,
      businessName: "Café Central",
      missing: ["category", "website"],
    });
  });

  it("fails closed when no partner context was authorized", async () => {
    const result = await getPartnerProfileTool.execute?.(
      {},
      { requestContext: new RequestContext() } as never,
    );

    expect(result).toMatchObject({ found: false, missing: [] });
  });
});
