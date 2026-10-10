import { describe, expect, it } from "vitest";
import {
  buildBrokerOnboardingApartmentPatch,
  resolveBrokerOnboardingAddress,
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
      "metadata",
      "price_monthly",
    ]);
    const forbidden = [
      "status", "moderation_status", "listing_workflow_status", "published_at",
      "published_by", "workflow_changed_by", "workflow_changed_at", "verified",
      "landlord_id", "created_by", "host_id", "featured", "slug",
    ];
    expect(forbidden.filter((name) => name in allFields)).toEqual([]);
  });
  it("omits coordinates and metadata for a free-text address", () => {
    const patch = buildBrokerOnboardingApartmentPatch(base);
    expect(patch.address).toBe("72 10th Street, Laureles");
    expect(patch.latitude).toBeUndefined();
    expect(patch.longitude).toBeUndefined();
    expect(patch.metadata).toBeUndefined();
    expect(patch.currency).toBe("COP");
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
    expect(patch.metadata).toEqual({
      place_id: "ChIJabc12345",
      formatted_address: "Calle 10 #42-15, Laureles, Medellín",
      address_source: "places_search",
    });
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
