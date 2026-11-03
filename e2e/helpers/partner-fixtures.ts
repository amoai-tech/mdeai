import { expect } from "@playwright/test";

import {
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  type ThrowawayIdentity,
} from "./auth";

export type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;

export async function createPartner(
  admin: Admin,
  profileId: string,
  type: "venue" | "developer",
  settings: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await admin
    .from("partners")
    .insert({ profile_id: profileId, type, status: "draft", settings })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  if (!data) throw new Error("partner insert returned no row");

  const membership = await admin.from("partner_members").insert({
    partner_id: data.id,
    profile_id: profileId,
    role: "owner",
  });
  expect(membership.error, membership.error?.message).toBeNull();
  return data.id;
}

/** Delete fixtures, then prove independently that no user, member or partner row remains. */
export async function cleanupFixtures(
  admin: Admin,
  partnerIds: string[],
  identities: ThrowawayIdentity[],
): Promise<void> {
  const failures: string[] = [];

  if (partnerIds.length > 0) {
    const members = await admin
      .from("partner_members")
      .delete()
      .in("partner_id", partnerIds);
    if (members.error) failures.push(`delete members: ${members.error.message}`);

    const partners = await admin.from("partners").delete().in("id", partnerIds);
    if (partners.error) failures.push(`delete partners: ${partners.error.message}`);
  }

  for (const identity of identities) {
    try {
      await deleteThrowawayIdentity(identity);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (partnerIds.length > 0) {
    const leftoverPartners = await admin
      .from("partners")
      .select("id")
      .in("id", partnerIds);
    if (leftoverPartners.error) {
      failures.push(`verify partners: ${leftoverPartners.error.message}`);
    } else if ((leftoverPartners.data ?? []).length > 0) {
      failures.push(`${leftoverPartners.data?.length} partner rows remain`);
    }

    const leftoverMembers = await admin
      .from("partner_members")
      .select("partner_id")
      .in("partner_id", partnerIds);
    if (leftoverMembers.error) {
      failures.push(`verify members: ${leftoverMembers.error.message}`);
    } else if ((leftoverMembers.data ?? []).length > 0) {
      failures.push(`${leftoverMembers.data?.length} partner member rows remain`);
    }
  }

  for (const identity of identities) {
    const profile = await admin
      .from("profiles")
      .select("id")
      .eq("id", identity.userId);
    if (profile.error) {
      failures.push(`verify profile: ${profile.error.message}`);
    } else if ((profile.data ?? []).length > 0) {
      failures.push(`profile row remains for ${identity.email}`);
    }

    const user = await admin.auth.admin.getUserById(identity.userId);
    if (user.data.user !== null) {
      failures.push(`auth user remains for ${identity.email}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`SAN-1579 cleanup failed: ${failures.join("; ")}`);
  }
}
