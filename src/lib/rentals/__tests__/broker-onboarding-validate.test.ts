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

  it("allows onboarding without business rights confirmation during development", () => {
    const result = validateBrokerOnboardingInput({
      ...valid,
      confirmedListingRights: false,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects invalid photo URL", () => {
    const result = validateBrokerOnboardingInput({ ...valid, photoUrl: "not-a-url" });
    expect(result.ok).toBe(false);
  });

  it("rejects an http photo URL that the HTTPS app could never display", () => {
    expect(validateBrokerOnboardingInput({ ...valid, photoUrl: "http://example.com/a.jpg" })).toEqual({
      ok: false,
      message: "Photo URL must use https.",
    });
  });

  it("accepts whole-number room counts", () => {
    expect(validateBrokerOnboardingInput({ ...valid, bedrooms: 0, bathrooms: 0 })).toEqual({
      ok: true,
    });
    expect(validateBrokerOnboardingInput({ ...valid, bedrooms: 4, bathrooms: 3 })).toEqual({
      ok: true,
    });
  });

  it("rejects half bathrooms because apartments.bathrooms is an integer", () => {
    expect(validateBrokerOnboardingInput({ ...valid, bathrooms: 1.5 })).toEqual({
      ok: false,
      message: "Bathrooms must be a whole number, not 1.5.",
    });
  });

  it("rejects half bedrooms instead of rounding them", () => {
    expect(validateBrokerOnboardingInput({ ...valid, bedrooms: 2.5 })).toEqual({
      ok: false,
      message: "Bedrooms must be a whole number, not 2.5.",
    });
  });

  it("rejects NaN and negative room counts", () => {
    expect(validateBrokerOnboardingInput({ ...valid, bathrooms: Number.NaN })).toEqual({
      ok: false,
      message: "Bathrooms must be a whole number.",
    });
    expect(validateBrokerOnboardingInput({ ...valid, bedrooms: -1 })).toEqual({
      ok: false,
      message: "Bedrooms cannot be negative.",
    });
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
