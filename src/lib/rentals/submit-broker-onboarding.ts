"use server";

import { redirect } from "next/navigation";
import {
  type BrokerOnboardingFormInput,
  type BrokerOnboardingSubmitResult,
  brokerNeighborhoodProfileFields,
  validateBrokerOnboardingInput,
} from "@/lib/rentals/broker-onboarding-validate";
import { BROKER_LISTINGS_PATH } from "@/lib/rentals/broker-route-gate";
import {
  buildBrokerOnboardingApartmentPatch,
  resolveBrokerOnboardingAddress,
  withVerifiedPlace,
  withoutUnverifiedCoordinates,
} from "@/lib/rentals/broker-onboarding-apartment-patch";
import { verifyPlaceId } from "@/lib/place-search";
import { createClient } from "@/lib/supabase/server";

export type { BrokerOnboardingFormInput, BrokerOnboardingSubmitResult };

// skipcq: JS-0067
function parseRpcJson(value: unknown): { apartment_id?: string; landlord_profile_id?: string } {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  return {
    apartment_id: typeof row.apartment_id === "string" ? row.apartment_id : undefined,
    landlord_profile_id:
      typeof row.landlord_profile_id === "string" ? row.landlord_profile_id : undefined,
  };
}

/** PTR-RENTALS-004 RPC + broker-scoped listing PATCH (SAN-1092). */
// skipcq: JS-0067 - JS-R1005 RPC + patch branches
// skipcq: JS-R1005
export async function submitBrokerOnboarding(
  input: BrokerOnboardingFormInput,
): Promise<BrokerOnboardingSubmitResult> {
  const validation = validateBrokerOnboardingInput(input);
  if (!validation.ok) return validation;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in to complete onboarding." };
  }

  // Trust boundary: normalized address and coordinates are persisted only from a
  // place ID verified server-side against Google Places. Browser-supplied
  // coordinates without a place ID are discarded — an unknown location stays
  // unknown rather than becoming a "Google verified" fact.
  let effectiveInput = input;
  if (input.placeId.trim()) {
    let verified;
    try {
      verified = await verifyPlaceId(input.placeId);
    } catch {
      verified = null;
    }
    if (!verified || !verified.formattedAddress) {
      return {
        ok: false,
        message: "We could not verify the selected address with Google. Pick it again.",
      };
    }
    effectiveInput = withVerifiedPlace(input, {
      formattedAddress: verified.formattedAddress,
      latitude: verified.latitude,
      longitude: verified.longitude,
    });
  } else if (input.latitude != null || input.longitude != null) {
    effectiveInput = withoutUnverifiedCoordinates(input);
  }

  const displayName = input.displayName.trim();
  const neighborhoodFields = brokerNeighborhoodProfileFields(input.neighborhoods);
  const primaryNeighborhood = neighborhoodFields.primary_neighborhood;
  const listingTitle = resolveBrokerOnboardingAddress(effectiveInput);
  const whatsapp = input.whatsapp.trim();

  const { data: rpcData, error: rpcError } = await supabase.rpc("create_broker_onboarding_draft", {
    p_display_name: displayName,
    p_listing_title: listingTitle,
    p_neighborhood: primaryNeighborhood,
  });

  if (rpcError) {
    return { ok: false, message: rpcError.message };
  }

  const { apartment_id: apartmentId, landlord_profile_id: landlordProfileId } =
    parseRpcJson(rpcData);

  if (!apartmentId || !landlordProfileId) {
    return { ok: false, message: "Onboarding draft was not created. Try again." };
  }

  const profilePatch: Record<string, string> = {
    primary_neighborhood: neighborhoodFields.primary_neighborhood,
    notes: neighborhoodFields.notes,
  };
  if (whatsapp) profilePatch.whatsapp_e164 = whatsapp;

  const { error: profileError } = await supabase
    .from("landlord_profiles")
    .update(profilePatch)
    .eq("id", landlordProfileId);

  if (profileError) {
    return { ok: false, message: profileError.message };
  }

  const apartmentPatch = buildBrokerOnboardingApartmentPatch(effectiveInput);

  const { error: apartmentError } = await supabase
    .from("apartments")
    .update(apartmentPatch)
    .eq("id", apartmentId);

  if (apartmentError) {
    return { ok: false, message: apartmentError.message };
  }

  redirect(BROKER_LISTINGS_PATH);
  return { ok: false, message: "Redirecting to listings." };
}
