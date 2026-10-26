import { describe, expect, it } from "vitest";
import { buildPartnerProfilePatch, profileValuesFromSettings } from "../partner-profile-patch";

const initial = {
  businessName: "Café Central",
  category: "cafe",
  neighborhood: "Laureles",
  website: "https://example.com",
  description: "Original description",
};

describe("partner profile dirty-field patch (SAN-814)", () => {
  it("does not send unrelated stale fields", () => {
    expect(buildPartnerProfilePatch({ ...initial, description: "New description" }, initial)).toEqual({
      description: "New description",
    });
    expect(buildPartnerProfilePatch({ ...initial, website: "https://new.example" }, initial)).toEqual({
      website: "https://new.example",
    });
  });

  it("supports clearing optional fields without clearing required fields accidentally", () => {
    expect(buildPartnerProfilePatch({ ...initial, description: "", website: "" }, initial)).toEqual({
      description: "",
      website: "",
    });
    expect(buildPartnerProfilePatch(initial, initial)).toEqual({});
  });

  it("ignores whitespace-only differences and accepts only string persisted values", () => {
    expect(buildPartnerProfilePatch({ ...initial, website: " https://example.com " }, initial)).toEqual({});
    expect(profileValuesFromSettings({ ...initial, website: null })).toEqual({
      ...initial, website: "",
    });
  });
});
