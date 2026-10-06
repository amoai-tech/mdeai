import type { BrokerOnboardingFormInput } from "./broker-onboarding-validate";

export type BrokerOnboardingApartmentMetadata = {
  place_id: string;
  formatted_address: string;
  address_source: "places_search";
};

export type BrokerOnboardingApartmentPatch = {
  address: string;
  bedrooms: number;
  bathrooms: number;
  price_monthly: number;
  currency: string;
  images?: string[];
  latitude?: number;
  longitude?: number;
  metadata?: BrokerOnboardingApartmentMetadata;
};

/** Provider-normalized address when a place was picked; otherwise the typed address. */
export function resolveBrokerOnboardingAddress(input: BrokerOnboardingFormInput): string {
  return input.formattedAddress.trim() || input.address.trim();
}

/**
 * Maps the validated onboarding form to the apartments update payload.
 * Coordinates and place identity are included only when the broker selected a
 * provider place; unknown facts stay absent so the DB default (null) applies.
 */
export function buildBrokerOnboardingApartmentPatch(
  input: BrokerOnboardingFormInput,
): BrokerOnboardingApartmentPatch {
  const address = resolveBrokerOnboardingAddress(input);
  const patch: BrokerOnboardingApartmentPatch = {
    address,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    price_monthly: input.monthlyRentCop,
    currency: "COP",
  };

  const photo = input.photoUrl.trim();
  if (photo) patch.images = [photo];

  if (input.latitude != null && input.longitude != null) {
    patch.latitude = input.latitude;
    patch.longitude = input.longitude;
  }

  const placeId = input.placeId.trim();
  if (placeId) {
    patch.metadata = {
      place_id: placeId,
      formatted_address: address,
      address_source: "places_search",
    };
  }

  return patch;
}
