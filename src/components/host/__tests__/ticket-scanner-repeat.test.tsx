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
  it("keeps manual entry available when browser mediaDevices is missing", async () => {
    // navigator.mediaDevices is undefined on insecure HTTP origins.
    const previous = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    try {
      render(<TicketScanner eventId="event-a" eventName="Concert" />);
      fireEvent.click(screen.getByTestId("scanner-enable-camera"));
      expect(screen.getByTestId("scanner-camera-error").textContent).toContain(
        "Use manual entry",
      );
      expect(screen.getByTestId("scanner-manual-input")).toBeTruthy();
    } finally {
      if (previous) Object.defineProperty(navigator, "mediaDevices", previous);
      else Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });
  it("shows one successful admission when the same QR remains in camera view", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const previous = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
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
      // Mock only this player's play() method, never the global DOM prototype.
      Object.defineProperty(screen.getByTestId("scanner-video"), "play", {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
      });
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
