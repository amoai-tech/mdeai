import { describe, expect, it } from "vitest";
import {
  buildBrokerOnboardingApartmentPatch,
  resolveBrokerOnboardingAddress,
  stripBrokerPlaceMetadata,
  withVerifiedPlace,
  withoutUnverifiedCoordinates,
} from "@/lib/rentals/broker-onboarding-apartment-patch";
import type { BrokerOnboardingFormInput } from "@/lib/rentals/broker-onboarding-validate";

const base: BrokerOnboardingFormInput = {
  displayName: "Ana Properties",
  whatsapp: "",
  neighborhoods: ["Laureles"],
  address: "72 10th Street, Laureles",
  bedrooms: 2,
  bathrooms: 1,
  monthlyRentCop: 2_400_000,
  photoUrl: "",
  confirmedListingRights: true,
  placeId: "",
  formattedAddress: "",
  latitude: null,
  longitude: null,
};

describe("buildBrokerOnboardingApartmentPatch", () => {
  it("emits only partner-editable apartment fields, never workflow or ownership fields", () => {
    // Actual SQL GRANT permissions (both allowed and denied) are tested by
    // san1106_publish_fsm_test.sql F4/F5 against PostgreSQL itself.
    // Do not parse migration SQL with a regex or duplicate its grant policy here.
    const allFields = buildBrokerOnboardingApartmentPatch({
      ...base,
      photoUrl: "https://example.com/authorized.jpg",
      placeId: "ChIJabc12345",
      formattedAddress: "Verified address",
      latitude: 6.2447,
      longitude: -75.5916,
    });
    expect(Object.keys(allFields).sort()).toEqual([
      "address",
      "bathrooms",
      "bedrooms",
      "currency",
      "images",
      "latitude",
      "longitude",
      "price_monthly",
    ]);
    const forbidden = [
      "status", "moderation_status", "listing_workflow_status", "published_at",
      "published_by", "workflow_changed_by", "workflow_changed_at", "verified",
      "landlord_id", "created_by", "host_id", "featured", "slug",
    ];
    expect(forbidden.filter((name) => name in allFields)).toEqual([]);
  });
  it("clears coordinates but never rewrites the whole metadata column", () => {
    const patch = buildBrokerOnboardingApartmentPatch(base);
    expect(patch.address).toBe("72 10th Street, Laureles");
    // Explicit nulls: the onboarding RPC reuses the newest draft, so an omitted
    // column would keep a location the broker has since replaced.
    expect(patch.latitude).toBeNull();
    expect(patch.longitude).toBeNull();
    // metadata is provenance-owned; the action strips only the place keys.
    expect("metadata" in patch).toBe(false);
    expect(patch.currency).toBe("COP");
  });

  it("does not keep a previous place's coordinates when the broker types a new address", () => {
    // The same draft row, saved again: the second submit has no selected place.
    const patch = buildBrokerOnboardingApartmentPatch({
      ...base,
      address: "Carrera 70 #44-12",
      placeId: "",
      formattedAddress: "",
      latitude: null,
      longitude: null,
    });
    expect(patch.latitude).toBeNull();
    expect(patch.longitude).toBeNull();
    expect("metadata" in patch).toBe(false);
  });

  it("keeps the place identity but no coordinates when Google returns none", () => {
    const patch = buildBrokerOnboardingApartmentPatch({
      ...base,
      placeId: "ChIJabc12345",
      formattedAddress: "Calle 10 #42-15, Laureles, Medellín",
      latitude: null,
      longitude: null,
    });
    expect(patch.latitude).toBeNull();
    expect(patch.longitude).toBeNull();
    expect("metadata" in patch).toBe(false);
  });

  it("persists trusted provider facts when a place was selected", () => {
    const patch = buildBrokerOnboardingApartmentPatch({
      ...base,
      placeId: "ChIJabc12345",
      formattedAddress: "Calle 10 #42-15, Laureles, Medellín",
      latitude: 6.2447,
      longitude: -75.5916,
    });
    expect(patch.address).toBe("Calle 10 #42-15, Laureles, Medellín");
    expect(patch.latitude).toBe(6.2447);
    expect(patch.longitude).toBe(-75.5916);
    expect("metadata" in patch).toBe(false);
  });

  it("still stores an authorized photo when provided", () => {
    const patch = buildBrokerOnboardingApartmentPatch({
      ...base,
      photoUrl: "https://example.com/apt.jpg",
    });
    expect(patch.images).toEqual(["https://example.com/apt.jpg"]);
  });

  it("withVerifiedPlace overrides browser-supplied facts with the server-verified Google facts", () => {
    const effective = withVerifiedPlace(
      { ...base, placeId: "ChIJabc12345", formattedAddress: "browser text", latitude: 1, longitude: 2 },
      { formattedAddress: "Google canonical address", latitude: 6.2447, longitude: -75.5916 },
    );
    expect(effective.formattedAddress).toBe("Google canonical address");
    expect(effective.latitude).toBe(6.2447);
    expect(effective.longitude).toBe(-75.5916);
  });

  it("withoutUnverifiedCoordinates drops coordinates that did not come from Google", () => {
    const effective = withoutUnverifiedCoordinates({ ...base, latitude: 6.2, longitude: -75.5 });
    expect(effective.latitude).toBeNull();
    expect(effective.longitude).toBeNull();
  });

  it("resolves the normalized address when present", () => {
    expect(
      resolveBrokerOnboardingAddress({ ...base, formattedAddress: "Normalized address" }),
    ).toBe("Normalized address");
    expect(resolveBrokerOnboardingAddress(base)).toBe("72 10th Street, Laureles");
  });
});

describe("stripBrokerPlaceMetadata", () => {
  it("removes only this flow's place keys and preserves provenance", () => {
    const existing = {
      place_id: "ChIJold",
      formatted_address: "Old address",
      address_source: "places_search",
      inventory_kind: "test_fixture",
      is_test_fixture: true,
      review_required_reason: "material edit after publication",
      review_required_at: "2026-11-01T00:00:00Z",
      mde_managed_development: true,
    };
    const result = stripBrokerPlaceMetadata(existing);
    expect(result.changed).toBe(true);
    expect(result.metadata).toEqual({
      inventory_kind: "test_fixture",
      is_test_fixture: true,
      review_required_reason: "material edit after publication",
      review_required_at: "2026-11-01T00:00:00Z",
      mde_managed_development: true,
    });
    // The caller's object is never mutated.
    expect(existing.place_id).toBe("ChIJold");
  });

  it("reports no change when there is no place metadata to remove", () => {
    const result = stripBrokerPlaceMetadata({ inventory_kind: "test_fixture" });
    expect(result.changed).toBe(false);
    expect(result.metadata).toEqual({ inventory_kind: "test_fixture" });
  });

  it("handles a null, array or scalar column without inventing a change", () => {
    expect(stripBrokerPlaceMetadata(null)).toEqual({ metadata: {}, changed: false });
    expect(stripBrokerPlaceMetadata(undefined)).toEqual({ metadata: {}, changed: false });
    const array = stripBrokerPlaceMetadata(["keep"]);
    expect(array.changed).toBe(false);
    expect(array.metadata).toEqual(["keep"]);
    expect(stripBrokerPlaceMetadata("scalar")).toEqual({ metadata: "scalar", changed: false });
  });
});
