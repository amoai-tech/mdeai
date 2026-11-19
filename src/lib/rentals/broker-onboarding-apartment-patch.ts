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
  /**
   * Always present. `null` clears the previous value: the onboarding RPC reuses
   * the broker's newest draft, so an UPDATE that merely omitted these fields
   * would keep a location from an address the broker has since replaced.
   */
  latitude: number | null;
  longitude: number | null;
  metadata: BrokerOnboardingApartmentMetadata | null;
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
/** Override browser-supplied address/coordinates with the server-verified Google facts. */
export function withVerifiedPlace(
  input: BrokerOnboardingFormInput,
  verified: { formattedAddress: string; latitude: number | null; longitude: number | null },
): BrokerOnboardingFormInput {
  return {
    ...input,
    formattedAddress: verified.formattedAddress,
    latitude: verified.latitude,
    longitude: verified.longitude,
  };
}

/** Drop unverified coordinates: a free-text address keeps an unknown location. */
export function withoutUnverifiedCoordinates(
  input: BrokerOnboardingFormInput,
): BrokerOnboardingFormInput {
  return { ...input, latitude: null, longitude: null };
}

export function buildBrokerOnboardingApartmentPatch(
  input: BrokerOnboardingFormInput,
): BrokerOnboardingApartmentPatch {
  const address = resolveBrokerOnboardingAddress(input);
  const placeId = input.placeId.trim();
  const hasPlaceCoordinates = input.latitude != null && input.longitude != null;
  const patch: BrokerOnboardingApartmentPatch = {
    address,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    price_monthly: input.monthlyRentCop,
    currency: "COP",
    // Explicit nulls, not omissions: the reused draft must not keep a location
    // that no longer matches the address in this submit.
    latitude: placeId && hasPlaceCoordinates ? input.latitude : null,
    longitude: placeId && hasPlaceCoordinates ? input.longitude : null,
    metadata: placeId
      ? { place_id: placeId, formatted_address: address, address_source: "places_search" }
      : null,
  };

  const photo = input.photoUrl.trim();
  if (photo) patch.images = [photo];

  return patch;
}
