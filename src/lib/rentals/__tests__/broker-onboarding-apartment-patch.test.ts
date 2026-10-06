import { describe, expect, it } from "vitest";
import {
  buildBrokerOnboardingApartmentPatch,
  resolveBrokerOnboardingAddress,
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

  it("resolves the normalized address when present", () => {
    expect(
      resolveBrokerOnboardingAddress({ ...base, formattedAddress: "Normalized address" }),
    ).toBe("Normalized address");
    expect(resolveBrokerOnboardingAddress(base)).toBe("72 10th Street, Laureles");
  });
});
