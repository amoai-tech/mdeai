import { describe, expect, it } from "vitest";

import {
  applySuggestionToForm,
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
