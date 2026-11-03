import { describe, expect, it } from "vitest";
import { canonicalPublicOrigin } from "@/lib/events/canonical-public-origin";

describe("SAN-1620 — the saved calendar points at the canonical host", () => {
  it("upgrades the apex to www so recipients skip the redirect", () => {
    expect(canonicalPublicOrigin("https://mdeai.co")).toBe("https://www.mdeai.co");
  });
  it("leaves www and preview hosts alone", () => {
    expect(canonicalPublicOrigin("https://www.mdeai.co")).toBe("https://www.mdeai.co");
    expect(canonicalPublicOrigin("https://mde-git-x.vercel.app")).toBe("https://mde-git-x.vercel.app");
  });
  it("returns null instead of a broken origin", () => {
    expect(canonicalPublicOrigin(null)).toBeNull();
    expect(canonicalPublicOrigin("not a url")).toBeNull();
  });
});
