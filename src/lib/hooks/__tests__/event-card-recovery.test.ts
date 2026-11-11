// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { requestEventCardRecovery } from "../use-concierge-send-handlers";

describe("requestEventCardRecovery", () => {
  it("resolves true only when the listener acknowledges the same request", async () => {
    const onRequest = (event: Event) => {
      const { requestId } = (event as CustomEvent<{ requestId: string }>).detail;
      window.dispatchEvent(new CustomEvent("mde:event-card-recovery-result", {
        detail: { requestId, opened: true },
      }));
    };
    window.addEventListener("mde:event-card-recovery", onRequest);
    await expect(requestEventCardRecovery("evt-1", 500)).resolves.toBe(true);
    window.removeEventListener("mde:event-card-recovery", onRequest);
  });

  it("resolves false when nobody answers, instead of confirming a no-op", async () => {
    vi.useFakeTimers();
    const pending = requestEventCardRecovery("evt-none", 1_800);
    await vi.advanceTimersByTimeAsync(1_900);
    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });

  it("ignores an acknowledgement for a different request", async () => {
    const onRequest = (event: Event) => {
      void (event as CustomEvent<{ requestId: string }>).detail.requestId;
      window.dispatchEvent(new CustomEvent("mde:event-card-recovery-result", {
        detail: { requestId: "someone-else", opened: true },
      }));
    };
    window.addEventListener("mde:event-card-recovery", onRequest);
    vi.useFakeTimers();
    const pending = requestEventCardRecovery("evt-2", 1_800);
    await vi.advanceTimersByTimeAsync(1_900);
    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
    window.removeEventListener("mde:event-card-recovery", onRequest);
  });
});
