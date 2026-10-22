import { describe, expect, it } from "vitest";

import { partnerAgent } from "../partner-agent";

describe("partnerAgent (SAN-705)", () => {
  it("is one registered agent with a stable id", () => {
    expect(partnerAgent.id).toBe("partner-agent");
  });

  it("covers every partner type and forbids invented business facts", async () => {
    const instructions = await partnerAgent.getInstructions();
    const text = String(instructions);
    for (const type of ["café", "restaurant", "nightclub", "event host", "rental"]) {
      expect(text.toLowerCase()).toContain(type);
    }
    expect(text).toContain("Never invent facts");
    expect(text).toContain("prelaunch");
    expect(text).toContain("no write tools yet");
  });

  it("exposes exactly one read-only partner profile tool", async () => {
    const tools = await partnerAgent.listTools();
    expect(Object.keys(tools)).toEqual(["getPartnerProfile"]);
    expect(tools.getPartnerProfile.id).toBe("get-partner-profile");
  });
});
