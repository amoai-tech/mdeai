import { describe, expect, it } from "vitest";
import {
  brokerNeighborhoodProfileFields,
  validateBrokerOnboardingInput,
} from "@/lib/rentals/broker-onboarding-validate";

const valid = {
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

describe("validateBrokerOnboardingInput", () => {
  it("accepts a complete payload without photo", () => {
    expect(validateBrokerOnboardingInput(valid)).toEqual({ ok: true });
  });

  it("accepts optional https photo URL", () => {
    expect(
      validateBrokerOnboardingInput({
        ...valid,
        photoUrl: "https://example.com/apt.jpg",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects missing display name", () => {
    const result = validateBrokerOnboardingInput({ ...valid, displayName: "  " });
    expect(result.ok).toBe(false);
  });

  it("rejects missing neighborhoods", () => {
    const result = validateBrokerOnboardingInput({ ...valid, neighborhoods: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects unconfirmed HITL ack", () => {
    const result = validateBrokerOnboardingInput({
      ...valid,
      confirmedListingRights: false,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid photo URL", () => {
    const result = validateBrokerOnboardingInput({ ...valid, photoUrl: "not-a-url" });
    expect(result.ok).toBe(false);
  });

  it("accepts a provider-selected place with trusted coordinates", () => {
    expect(
      validateBrokerOnboardingInput({
        ...valid,
        placeId: "ChIJabc12345",
        formattedAddress: "Calle 10 #42-15, Laureles, Medellín",
        latitude: 6.2447,
        longitude: -75.5916,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a half coordinate pair", () => {
    expect(validateBrokerOnboardingInput({ ...valid, latitude: 6.2447 }).ok).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(validateBrokerOnboardingInput({ ...valid, latitude: 91, longitude: -75 }).ok).toBe(false);
    expect(validateBrokerOnboardingInput({ ...valid, latitude: 6, longitude: -181 }).ok).toBe(false);
  });

  it("rejects a malformed place id", () => {
    expect(validateBrokerOnboardingInput({ ...valid, placeId: "not a place" }).ok).toBe(false);
  });
});

describe("brokerNeighborhoodProfileFields", () => {
  it("persists all selected neighborhoods in notes", () => {
    expect(
      brokerNeighborhoodProfileFields(["Laureles", "El Poblado", "Envigado"]),
    ).toEqual({
      primary_neighborhood: "Laureles",
      notes: "service_neighborhoods:Laureles,El Poblado,Envigado",
    });
  });
});
