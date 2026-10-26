import type { RequestContext } from "@mastra/core/request-context";
import type { SupabaseClient } from "@supabase/supabase-js";

/** RequestContext key for the signed-in partner, server-derived once per turn. */
export const PARTNER_CONTEXT_KEY = "mde.partnerContext";

export type PartnerRuntimeContext = {
  userId: string;
  partnerId: string;
  partnerType: string;
  partnerStatus: string;
  role: string;
  businessName: string | null;
  category: string | null;
  neighborhood: string | null;
  website: string | null;
  description: string | null;
};

export function setPartnerRuntimeContext(
  requestContext: RequestContext,
  context: PartnerRuntimeContext,
): void {
  requestContext.set(PARTNER_CONTEXT_KEY, context);
}

export function getPartnerRuntimeContext(
  requestContext: RequestContext,
): PartnerRuntimeContext | null {
  const value = requestContext.get(PARTNER_CONTEXT_KEY);
  return value && typeof value === "object"
    ? (value as PartnerRuntimeContext)
    : null;
}

function readSetting(
  settings: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Load the partner context for an authenticated user using the user-scoped
 * Supabase client, so RLS — not this function — decides what is visible.
 * Returns null when the user has no partner membership yet.
 */
export async function loadPartnerRuntimeContext(
  supabase: SupabaseClient,
  userId: string,
  selectedPartnerId?: string,
): Promise<PartnerRuntimeContext | null> {
  const { data: memberships, error: membershipError } = await supabase
    .from("partner_members")
    .select("partner_id, role")
    .eq("profile_id", userId);

  if (membershipError || !memberships) {
    // Database outages must not masquerade as an unselected business.
    throw new Error("partner_membership_lookup_failed");
  }
  if (memberships.length === 0) return null;

  const allowed = memberships.filter(
    (row): row is { partner_id: string; role: string } =>
      typeof row.partner_id === "string" && typeof row.role === "string",
  );
  const membership = selectedPartnerId
    ? allowed.find((row) => row.partner_id === selectedPartnerId)
    : allowed.length === 1
      ? allowed[0]
      : undefined;

  // A selected id is only a selector. If it is not one of the caller's
  // memberships, or a multi-business account has not selected one, fail closed.
  if (!membership) return null;

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, type, status, settings")
    .eq("id", membership.partner_id)
    .maybeSingle();
  if (partnerError || !partner) {
    // A selected authorized membership with no readable partner is inconsistent,
    // not a reason to invite the user to sign up again.
    throw new Error("partner_profile_lookup_failed");
  }

  const settings = (partner.settings ?? {}) as Record<string, unknown>;
  return {
    userId,
    partnerId: partner.id,
    partnerType: partner.type,
    partnerStatus: partner.status,
    role: membership.role,
    businessName: readSetting(settings, "businessName"),
    category: readSetting(settings, "category"),
    neighborhood: readSetting(settings, "neighborhood"),
    website: readSetting(settings, "website"),
    description: readSetting(settings, "description"),
  };
}
