import { describe, expect, it } from "vitest";
import { isTrackingOutbound, recordOutboundSend, runWithOutboundTracking } from "../outbound-tracker";

describe("outbound tracker", () => {
  it("collects the sends made inside a scope", async () => {
    const { result, sends } = await runWithOutboundTracking(async () => {
      expect(isTrackingOutbound()).toBe(true);
      recordOutboundSend({ success: true, providerMessageId: "wamid.1" });
      recordOutboundSend({ success: false, error: "boom" });
      return "done";
    });
    expect(result).toBe("done");
    expect(sends).toEqual([
      { success: true, providerMessageId: "wamid.1" },
      { success: false, error: "boom" },
    ]);
  });

  it("is a no-op outside a scope so normal sends are untouched", () => {
    expect(isTrackingOutbound()).toBe(false);
    expect(() => recordOutboundSend({ success: true, providerMessageId: null })).not.toThrow();
  });

  it("does not leak sends between scopes", async () => {
    await runWithOutboundTracking(async () => {
      recordOutboundSend({ success: true, providerMessageId: "a" });
    });
    const { sends } = await runWithOutboundTracking(async () => {});
    expect(sends).toEqual([]);
  });
});
