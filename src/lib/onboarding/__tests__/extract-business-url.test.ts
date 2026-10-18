import { describe, expect, it } from "vitest";

import {
  businessUrlDraftSchema,
  parseDraftJson,
} from "../extract-business-url";

describe("business URL extraction parsing (SAN-1193)", () => {
  it("parses JSON wrapped in markdown or prose", () => {
    expect(
      parseDraftJson('Here you go:\n\n```json\n{"businessName":"Café Central"}\n```'),
    ).toEqual({ businessName: "Café Central" });
  });

  it("rejects text without JSON", () => {
    expect(parseDraftJson("I could not read that page.")).toBeNull();
    expect(parseDraftJson("{broken")).toBeNull();
  });

  it("accepts only known draft fields", () => {
    const parsed = businessUrlDraftSchema.safeParse({
      businessName: "Café Central",
      category: "Café",
      neighborhood: "Laureles",
      website: "https://cafe.example.com",
      description: "Specialty coffee.",
      sources: ["https://cafe.example.com"],
      unknownFields: ["openingHours"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects privileged or unknown model output", () => {
    expect(
      businessUrlDraftSchema.safeParse({ businessName: "Café", status: "active" }).success,
    ).toBe(false);
  });

  it("rejects a draft with no business details", () => {
    expect(businessUrlDraftSchema.safeParse({ sources: [] }).success).toBe(false);
  });
});
