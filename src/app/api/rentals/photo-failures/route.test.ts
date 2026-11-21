import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-ip-rate-limit", () => ({ checkSearchFastPathRateLimit: () => null }));

import { POST } from "./route";

const request = (body: unknown) => new Request("https://mdeai.co/api/rentals/photo-failures", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

describe("rental gallery error telemetry", () => {
  it("logs a structured approved host without leaking URLs or user data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await POST(request({ host: "images.unsplash.com" }))).status).toBe(204);
      expect(warn).toHaveBeenCalledOnce();
      expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
        event: "rentals.gallery.photo_failed", host: "images.unsplash.com",
      });
    } finally { warn.mockRestore(); }
  });
  it("rejects arbitrary hosts or extra payload data", async () => {
    expect((await POST(request({ host: "127.0.0.1" }))).status).toBe(400);
    expect((await POST(request({ host: "images.unsplash.com", url: "https://secret" }))).status).toBe(400);
  });
});
