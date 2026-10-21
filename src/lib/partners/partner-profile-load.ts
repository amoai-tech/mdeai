import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

export type PartnerProfileRecord = {
  id: string;
  type: string;
  status: string;
  settings: Record<string, unknown>;
};

export type PartnerProfileLoad =
  | { status: "loaded"; partner: PartnerProfileRecord; options: PartnerProfileRecord[] }
  | { status: "selection_required"; options: PartnerProfileRecord[] }
  | { status: "forbidden" }
  | { status: "missing" }
  | { status: "error" };

/**
 * Load all authorized memberships rather than calling maybeSingle().
 * A user belonging to multiple businesses must choose one explicitly.
 */
export async function loadPartnerProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  selectedPartnerId?: string,
): Promise<PartnerProfileLoad> {
  const { data: memberships, error: membershipError } = await supabase
    .from("partner_members")
    .select("partner_id")
    .eq("profile_id", userId);

  if (membershipError) return { status: "error" };
  if (!memberships?.length) return { status: "missing" };

  const allowedIds = [...new Set(memberships.map((row) => row.partner_id))];
  if (selectedPartnerId && !allowedIds.includes(selectedPartnerId)) {
    return { status: "forbidden" };
  }

  const { data: records, error: partnerError } = await supabase
    .from("partners")
    .select("id, type, status, settings")
    .in("id", allowedIds);

  if (partnerError || !records || records.length !== allowedIds.length) {
    return { status: "error" };
  }

  const options = records.map((partner) => ({
    id: partner.id,
    type: partner.type,
    status: partner.status,
    settings: (partner.settings ?? {}) as Record<string, unknown>,
  }));
  const selectedId = selectedPartnerId ?? (options.length === 1 ? options[0].id : undefined);
  if (!selectedId) return { status: "selection_required", options };

  const partner = options.find((record) => record.id === selectedId);
  if (!partner) return { status: "error" };
  return { status: "loaded", partner, options };
}
