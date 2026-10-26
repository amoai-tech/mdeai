// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TicketScanner } from "@/components/host/ticket-scanner";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("camera ticket check-in", () => {
  it("shows one successful admission when the same QR remains in camera view", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const previous = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const detect = vi.fn().mockResolvedValue([{ rawValue: "same-paid-qr" }]);
    vi.stubGlobal("BarcodeDetector", class {
      detect = detect;
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: "consumed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const { unmount } = render(<TicketScanner eventId="event-a" eventName="Concert" />);
      fireEvent.click(screen.getByTestId("scanner-enable-camera"));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId("scanner-result-title").textContent).toBe("ADMIT");
      await new Promise((resolve) => setTimeout(resolve, 900));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("scanner-result-title").textContent).toBe("ADMIT");
      unmount();
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      if (previous) Object.defineProperty(navigator, "mediaDevices", previous);
      else Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });
});
