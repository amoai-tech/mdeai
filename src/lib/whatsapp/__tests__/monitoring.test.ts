import { afterEach, describe, expect, it, vi } from "vitest";
import { reportInboundProcessingFailure, setInboundFailureSink } from "../monitoring";

afterEach(() => {
  setInboundFailureSink(null);
});

describe("reportInboundProcessingFailure", () => {
  it("emits one structured line and forwards the event to the sink", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sink = vi.fn();
    setInboundFailureSink(sink);
    reportInboundProcessingFailure(new Error("claim rpc down"), {
      workerId: "sweeper:1",
      stage: "sweeper",
      summary: { claimed: 0 },
    });
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0].event).toBe("whatsapp.inbound.processing_failed");
    const line = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(line).toMatchObject({
      event: "whatsapp.inbound.processing_failed",
      workerId: "sweeper:1",
      stage: "sweeper",
      errorName: "Error",
      errorLength: "claim rpc down".length,
    });
    expect(String(errorSpy.mock.calls[0][0])).not.toContain("claim rpc down");
    errorSpy.mockRestore();
  });

  it("never logs raw error text that could carry customer data", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportInboundProcessingFailure(
      new Error("send failed for +573001234567 https://wa.me/573001234567"),
      { workerId: "webhook:1", stage: "webhook_after" },
    );
    const logged = String(errorSpy.mock.calls[0][0]);
    expect(logged).not.toContain("573001234567");
    expect(logged).not.toContain("https://wa.me");
    errorSpy.mockRestore();
  });

  it("does not throw when no sink is wired", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      reportInboundProcessingFailure("boom", { workerId: "w", stage: "webhook_after" }),
    ).not.toThrow();
    errorSpy.mockRestore();
  });

  it("swallows a throwing sink so background callers never crash", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setInboundFailureSink(() => {
      throw new Error("sink down");
    });
    expect(() =>
      reportInboundProcessingFailure(new Error("x"), { workerId: "w", stage: "sweeper" }),
    ).not.toThrow();
    errorSpy.mockRestore();
  });
});
