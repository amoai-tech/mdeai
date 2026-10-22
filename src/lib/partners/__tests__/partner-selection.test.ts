import { describe, expect, it } from "vitest";
import {
  PARTNER_SELECTION_CONTEXT_DESCRIPTION,
  readPartnerSelectionFromRun,
} from "../partner-selection";

const partnerA = "da1ea4f6-e5b4-4c90-a3a1-2a163413f72d";
const partnerB = "d715bbd2-4108-4bc2-b27d-3bdf671a003c";

function run(partnerId: unknown, options?: { agent?: string; contexts?: unknown[]; method?: string }) {
  const context = options?.contexts ?? [{
    description: PARTNER_SELECTION_CONTEXT_DESCRIPTION,
    value: JSON.stringify({ partnerId }),
  }];
  return new Request("http://localhost/api/copilotkit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      method: options?.method ?? "agent/run",
      params: { agentId: options?.agent ?? "partnerAgent" },
      body: { threadId: "t", context, messages: [{ role: "user", content: "profile?" }] },
    }),
  });
}

describe("partner selection travels with each run (SAN-705)", () => {
  it("keeps two business tabs independent without a shared cookie", async () => {
    const tabA = run(partnerA);
    const tabB = run(partnerB);
    expect(await readPartnerSelectionFromRun(tabA)).toBe(partnerA);
    expect(await readPartnerSelectionFromRun(tabB)).toBe(partnerB);
    // Cloning must preserve the exact body for downstream AG-UI processing.
    expect((await tabA.json()).body.messages[0].content).toBe("profile?");
  });

  it("does not take selection from concierge or runtime info operations", async () => {
    expect(await readPartnerSelectionFromRun(run(partnerA, { agent: "conciergeAgent" }))).toBeNull();
    expect(await readPartnerSelectionFromRun(run(partnerA, { method: "info" }))).toBeNull();
  });

  it("fails closed when the selector is absent, duplicated, malformed or non-UUID", async () => {
    expect(await readPartnerSelectionFromRun(run(partnerA, { contexts: [] }))).toBeNull();
    const duplicate = { description: PARTNER_SELECTION_CONTEXT_DESCRIPTION, value: JSON.stringify({ partnerId: partnerB }) };
    expect(await readPartnerSelectionFromRun(run(partnerA, { contexts: [duplicate, duplicate] }))).toBeNull();
    expect(await readPartnerSelectionFromRun(run("partner-not-a-uuid"))).toBeNull();
    expect(await readPartnerSelectionFromRun(run(partnerA, { contexts: [{ ...duplicate, value: "{" }] }))).toBeNull();
  });

  it("does not accept a cookie as the selected business", async () => {
    const req = run(partnerA, { contexts: [] });
    req.headers.set("cookie", "mde_partner_id=" + partnerB);
    expect(await readPartnerSelectionFromRun(req)).toBeNull();
  });
});
