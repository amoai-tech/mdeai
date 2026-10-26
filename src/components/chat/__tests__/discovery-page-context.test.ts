import { describe, expect, it } from "vitest";
import { publicDiscoveryContext } from "../discovery-page-context";

describe("public MDE page context (SAN-737)", () => {
  it("includes only allowlisted public filters and a selected UUID", () => {
    expect(publicDiscoveryContext("rentals", {
      neighborhood: " Laureles ", beds: "2", privateEmail: "hidden", ownerId: "private",
    }, "5247d1e6-407f-4822-969f-4f7799ef7124")).toEqual({
      route: "/rentals",
      filters: { neighborhood: "Laureles", beds: "2" },
      selectedPublicEntityId: "5247d1e6-407f-4822-969f-4f7799ef7124",
    });
  });
  it("does not preserve a closed or invalid selection", () => {
    expect(publicDiscoveryContext("rentals", {}, null).selectedPublicEntityId).toBeNull();
    expect(publicDiscoveryContext("restaurants", {}, "forged-private-id").selectedPublicEntityId).toBeNull();
    expect(publicDiscoveryContext("events", { category: "music", token: "private" }).filters)
      .toEqual({ category: "music" });
  });
  it("uses separate page-specific fields on navigation", () => {
    expect(publicDiscoveryContext("cafes", { feature: "workspace", vibe: "salsa" })).toEqual({
      route: "/cafes", filters: { feature: "workspace" }, selectedPublicEntityId: null,
    });
    expect(publicDiscoveryContext("nightlife", { feature: "workspace", vibe: "salsa" })).toEqual({
      route: "/nightlife", filters: { vibe: "salsa" }, selectedPublicEntityId: null,
    });
  });
});
