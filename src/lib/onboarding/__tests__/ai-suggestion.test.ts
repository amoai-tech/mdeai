import { describe, expect, it } from "vitest";

import {
  applySuggestionToForm,
  isCurrentFormRevision,
  parseRevisedPartnerSuggestion,
  parsePartnerProfileSuggestion,
} from "../ai-suggestion";

describe("partner AI suggestion contract (SAN-709)", () => {
  it("accepts only known profile fields and trims values", () => {
    expect(
      parsePartnerProfileSuggestion({
        businessName: "  Café Central ",
        category: " Café ",
        neighborhood: "Laureles",
        reason: "From the user's message",
      }),
    ).toEqual({
      businessName: "Café Central",
      category: "Café",
      neighborhood: "Laureles",
      reason: "From the user's message",
    });
  });

  it("rejects unknown/privileged keys", () => {
    expect(
      parsePartnerProfileSuggestion({ businessName: "Café", status: "active" }),
    ).toBeNull();
  });

  it("rejects an empty or too-short suggestion", () => {
    expect(parsePartnerProfileSuggestion({})).toBeNull();
    expect(parsePartnerProfileSuggestion({ businessName: "A" })).toBeNull();
  });

  it("rejects non-object model output", () => {
    expect(parsePartnerProfileSuggestion("businessName: Café")).toBeNull();
    expect(parsePartnerProfileSuggestion(null)).toBeNull();
  });

  it("requires an exact revision from the AI tool call", () => {
    expect(isCurrentFormRevision(2, 2)).toBe(true);
    expect(isCurrentFormRevision(1, 2)).toBe(false);
    expect(isCurrentFormRevision("2", 2)).toBe(false);
    expect(parseRevisedPartnerSuggestion({ formRevision: 2, category: "Café" }, 2))
      .toEqual({ category: "Café" });
    expect(parseRevisedPartnerSuggestion({ formRevision: 1, category: "Café" }, 2))
      .toBeNull();
    expect(parseRevisedPartnerSuggestion({ category: "Café" }, 2)).toBeNull();
    expect(parseRevisedPartnerSuggestion({
      formRevision: 2, category: "Café", status: "active",
    }, 2)).toBeNull();
  });

  it("applies only the accepted fields and preserves manual edits", () => {
    const form = {
      businessName: "Manual name",
      category: "Manual category",
      neighborhood: "Manual neighborhood",
    };
    expect(
      applySuggestionToForm(form, { category: "Café", neighborhood: "Laureles" }),
    ).toEqual({
      businessName: "Manual name",
      category: "Café",
      neighborhood: "Laureles",
    });
  });
});
