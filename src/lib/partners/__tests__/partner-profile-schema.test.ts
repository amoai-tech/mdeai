import { describe, expect, it } from "vitest";

import { partnerProfileUpdateSchema } from "../partner-profile-schema";

describe("partnerProfileUpdateSchema (SAN-814)", () => {
  it("accepts a partial update", () => {
    const parsed = partnerProfileUpdateSchema.safeParse({
      businessName: "Café Central",
      category: "Café",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(partnerProfileUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown privileged keys", () => {
    expect(
      partnerProfileUpdateSchema.safeParse({ status: "active" }).success,
    ).toBe(false);
  });

  it("accepts an empty website but rejects a non-http(s) URL", () => {
    expect(
      partnerProfileUpdateSchema.safeParse({ website: "" }).success,
    ).toBe(true);
    expect(
      partnerProfileUpdateSchema.safeParse({ website: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      partnerProfileUpdateSchema.safeParse({ website: "https://example.com" }).success,
    ).toBe(true);
  });

  it("bounds the business name and description length", () => {
    expect(
      partnerProfileUpdateSchema.safeParse({ businessName: "A" }).success,
    ).toBe(false);
    expect(
      partnerProfileUpdateSchema.safeParse({ description: "x".repeat(1001) }).success,
    ).toBe(false);
  });
});
