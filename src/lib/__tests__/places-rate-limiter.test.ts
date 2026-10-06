import { afterEach, describe, expect, it } from "vitest";
import { createPlacesRateLimiter } from "@/lib/places-rate-limiter";

describe("places rate limiter key", () => {
  afterEach(() => {
    delete process.env.VERCEL;
  });

  it("trusts x-vercel-forwarded-for only when running on Vercel", () => {
    const limiter = createPlacesRateLimiter(5);
    const req = new Request("http://x", {
      headers: { "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2" },
    });
    delete process.env.VERCEL;
    expect(limiter.rateLimitKey(req)).toBe("2.2.2.2");
    process.env.VERCEL = "1";
    expect(limiter.rateLimitKey(req)).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip, then unknown", () => {
    const limiter = createPlacesRateLimiter(5);
    expect(
      limiter.rateLimitKey(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } })),
    ).toBe("9.9.9.9");
    expect(limiter.rateLimitKey(new Request("http://x"))).toBe("unknown");
  });
});
