import { describe, expect, it } from "vitest";
import { confirmedSends, isTrackingOutbound, recordOutboundSend, runWithOutboundTracking } from "../outbound-tracker";

describe("outbound tracker", () => {
  it("collects the sends made inside a scope", async () => {
    const { result, sends } = await runWithOutboundTracking(async () => {
      expect(isTrackingOutbound()).toBe(true);
      recordOutboundSend({ success: true, providerMessageId: "wamid.1", content: "one" });
      recordOutboundSend({ success: false, error: "boom" });
      return "done";
    });
    expect(result).toBe("done");
    expect(sends).toEqual([
      { success: true, providerMessageId: "wamid.1", content: "one" },
      { success: false, error: "boom" },
    ]);
  });

  it("is a no-op outside a scope so normal sends are untouched", () => {
    expect(isTrackingOutbound()).toBe(false);
    expect(() => recordOutboundSend({ success: true, providerMessageId: null, content: "" })).not.toThrow();
  });

  it("keeps every accepted send with an id, and drops failures or id-less sends", () => {
    const confirmed = confirmedSends([
      { success: true, providerMessageId: "wamid.1", content: "one" },
      { success: true, providerMessageId: "wamid.2", content: "two" },
      { success: true, providerMessageId: null, content: "no id" },
      { success: false, error: "boom" },
    ]);
    expect(confirmed).toEqual([
      { wamid: "wamid.1", content: "one" },
      { wamid: "wamid.2", content: "two" },
    ]);
  });

  it("does not leak sends between scopes", async () => {
    await runWithOutboundTracking(async () => {
      recordOutboundSend({ success: true, providerMessageId: "a", content: "a" });
    });
    const { sends } = await runWithOutboundTracking(async () => {});
    expect(sends).toEqual([]);
  });
});
