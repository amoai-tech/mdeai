import { describe, expect, it } from "vitest";
import {
  buildTicketCheckoutReturnUrls,
  trustedCheckoutOrigin,
} from "../checkout-return-url";

describe("trusted Stripe Checkout return origin", () => {
  it("uses only configured server origin, not request Host headers", () => {
    expect(trustedCheckoutOrigin("https://www.mdeai.co/", undefined, true))
      .toBe("https://www.mdeai.co");
  });
  it("uses Vercel's server-defined preview URL in non-production mode", () => {
    expect(trustedCheckoutOrigin(undefined, "mde-preview.vercel.app", true, "preview"))
      .toBe("https://mde-preview.vercel.app");
  });
  it("never uses VERCEL_URL as production return origin without an explicit site domain", () => {
    expect(() => trustedCheckoutOrigin(undefined, "mdeai-abc123-amoco.vercel.app", true, "production"))
      .toThrow("CHECKOUT_ORIGIN_NOT_CONFIGURED");
    expect(trustedCheckoutOrigin("https://www.mdeai.co", "mdeai-abc123-amoco.vercel.app", true))
      .toBe("https://www.mdeai.co");
    expect(trustedCheckoutOrigin(undefined, "mde-preview.vercel.app", false))
      .toBe("https://mde-preview.vercel.app");
  });
  it("fails closed without production configuration", () => {
    expect(() => trustedCheckoutOrigin(undefined, undefined, true))
      .toThrow("CHECKOUT_ORIGIN_NOT_CONFIGURED");
    expect(() => trustedCheckoutOrigin("http://evil.example", undefined, true))
      .toThrow("CHECKOUT_ORIGIN_INVALID");
    expect(() =>
      trustedCheckoutOrigin(
        "https://user:password@example.com",
        undefined,
        true,
      )
    )
      .toThrow("CHECKOUT_ORIGIN_INVALID");
  });
  it("retains localhost origin for development", () => {
    expect(trustedCheckoutOrigin(undefined, undefined, false))
      .toBe("http://localhost:3001");
  });
});
describe("ticket Checkout return URLs", () => {
  it("retains the exact Stripe Session placeholder and same-origin event path", () => {
    const x = buildTicketCheckoutReturnUrls(
      "https://www.mdeai.co",
      "/events/demo?tab=tickets",
    );
    expect(x.successUrl).toBe(
      "https://www.mdeai.co/events/demo?tab=tickets&checkout=success&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(x.cancelUrl).toBe(
      "https://www.mdeai.co/events/demo?tab=tickets&checkout=cancelled",
    );
  });
  it("removes untrusted prior checkout and session_id query values", () => {
    const x = buildTicketCheckoutReturnUrls(
      "https://www.mdeai.co",
      "/events/demo?checkout=success&session_id=fake&x=1",
    );
    expect(x.successUrl).toContain(
      "x=1&checkout=success&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(x.successUrl).not.toContain("fake");
  });
  it.each([
    "https://evil.example",
    "//evil.example/events/1",
    "/api/checkout",
    "/events/ok#evil",
    "/events/ok\\evil.example",
    "events/relative",
  ])("rejects unsafe return path %s", (path) => {
    expect(() => buildTicketCheckoutReturnUrls("https://www.mdeai.co", path))
      .toThrow("CHECKOUT_RETURN_PATH_INVALID");
  });
});
