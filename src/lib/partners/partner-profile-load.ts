import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export type PartnerProfileRecord = {
  id: string;
  type: string;
  status: string;
  settings: Record<string, unknown>;
};

export type PartnerProfileLoad =
  | { status: "loaded"; partner: PartnerProfileRecord }
  | { status: "missing" }
  | { status: "error" };

/**
 * SAN-814 — distinguish "no partner membership" from "the query failed".
 * A transient Supabase error must never send an existing partner to signup.
 */
export async function loadPartnerProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PartnerProfileLoad> {
  const { data: membership, error: membershipError } = await supabase
    .from("partner_members")
    .select("partner_id")
    .eq("profile_id", userId)
    .maybeSingle();

  if (membershipError) return { status: "error" };
  if (!membership) return { status: "missing" };

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, type, status, settings")
    .eq("id", membership.partner_id)
    .maybeSingle();

  if (partnerError || !partner) return { status: "error" };

  return {
    status: "loaded",
    partner: {
      id: partner.id,
      type: partner.type,
      status: partner.status,
      settings: (partner.settings ?? {}) as Record<string, unknown>,
    },
  };
}
