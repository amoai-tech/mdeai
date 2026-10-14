import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { mapPublishTransitionFromRpc } from "./publish-transition-mapper";
import type { PublishTransitionResult } from "./broker-surface-state";

type DbClient = SupabaseClient<Database>;

/** The two declarations the advertiser must make to publish self-attested. */
export type RentalSelfAttestation = {
  advertisingAuthority: boolean;
  photoRights: boolean;
};

export type RunSelfAttestedPublishResult =
  | { ok: true; transition: PublishTransitionResult }
  | { ok: false; message: string; status: 400 | 403 | 404 | 500 };

function selfAttestedPublishFailure(
  message: string,
  code?: string,
): Extract<RunSelfAttestedPublishResult, { ok: false }> {
  if (code === "42501" || /authentication required|not authorized to publish/i.test(message)) {
    return { ok: false, message, status: 403 };
  }
  if (code === "P0002" || /apartment .* not found/i.test(message)) {
    return { ok: false, message, status: 404 };
  }
  if (
    code === "check_violation" ||
    /self-attestation required|not self-attestation-ready|rejected listings/i.test(message)
  ) {
    return { ok: false, message, status: 400 };
  }
  if (/unexpected payload|Failed to map publish transition/i.test(message)) {
    return { ok: false, message, status: 500 };
  }
  return { ok: false, message, status: 500 };
}

/**
 * Publish an owned apartment through the self-attested path.
 *
 * The landlord declares advertising authority and photo rights; the database
 * records the attestation and publishes the listing with verified = false and
 * provenance = self_attested. It is never presented as independently verified.
 */
export async function runSelfAttestedPublishRpc(
  supabase: DbClient,
  apartmentId: string,
  attestation: RentalSelfAttestation,
): Promise<RunSelfAttestedPublishResult> {
  const { data, error } = await supabase.rpc("publish_self_attested_rental", {
    p_apartment_id: apartmentId,
    p_advertising_authority: attestation.advertisingAuthority,
    p_photo_rights: attestation.photoRights,
  });

  if (error) {
    return selfAttestedPublishFailure(error.message, error.code);
  }

  if (!data || typeof data !== "object" || !("id" in data)) {
    return selfAttestedPublishFailure("Publish RPC returned an unexpected payload.");
  }

  try {
    const transition = mapPublishTransitionFromRpc(
      data as Parameters<typeof mapPublishTransitionFromRpc>[0],
    );
    return { ok: true, transition };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to map publish transition.";
    return selfAttestedPublishFailure(message);
  }
}
