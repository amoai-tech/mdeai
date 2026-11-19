import type { Json } from "@/lib/supabase/database.types";
import type { BrokerOnboardingFormInput } from "./broker-onboarding-validate";

export type BrokerOnboardingApartmentMetadata = {
  place_id: string;
  formatted_address: string;
  address_source: "places_search";
};

/**
 * The only `apartments.metadata` keys this onboarding flow owns.
 *
 * `metadata` is also the provenance store for fixture/external classification and
 * the material-edit guard's `review_required_*` record. `protect_apartment_provenance`
 * is a BEFORE UPDATE OF metadata trigger that raises 42501 when a fixture/external
 * marker disappears, so this flow must never rewrite the whole column.
 */
export const BROKER_PLACE_METADATA_KEYS = [
  "place_id",
  "formatted_address",
  "address_source",
] as const;

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
  /** Present only when a place was selected, or when place keys must be removed. */
  metadata?: BrokerOnboardingApartmentMetadata | Json | null;
};

/** Provider-normalized address when a place was picked; otherwise the typed address. */
export function resolveBrokerOnboardingAddress(input: BrokerOnboardingFormInput): string {
  return input.formattedAddress.trim() || input.address.trim();
}

/**
 * Remove only this flow's place keys from an existing metadata object.
 *
 * Everything else — `inventory_kind`, `is_test_fixture`, `review_required_reason`,
 * photo/owner status, development keys — is preserved, which is what keeps the
 * provenance trigger satisfied on a reused draft.
 */
export function stripBrokerPlaceMetadata(metadata: Json | null | undefined): {
  metadata: Json;
  changed: boolean;
} {
  if (metadata === null || metadata === undefined) {
    return { metadata: {}, changed: false };
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return { metadata, changed: false };
  }
  const next: Record<string, Json | undefined> = { ...metadata };
  let changed = false;
  for (const key of BROKER_PLACE_METADATA_KEYS) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }
  return { metadata: next, changed };
}

/**
 * Override browser-supplied address/coordinates with the server-verified Google facts.
 */
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

/**
 * Maps the validated onboarding form to the apartments update payload.
 * Coordinates are always explicit so a reused draft cannot keep a location that
 * no longer matches; metadata is written only for a verified place, or by
 * `submitBrokerOnboarding` after it strips the existing place keys.
 */
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
    latitude: placeId && hasPlaceCoordinates ? input.latitude : null,
    longitude: placeId && hasPlaceCoordinates ? input.longitude : null,
  };

  if (placeId) {
    patch.metadata = { place_id: placeId, formatted_address: address, address_source: "places_search" };
  }

  const photo = input.photoUrl.trim();
  if (photo) patch.images = [photo];

  return patch;
}
