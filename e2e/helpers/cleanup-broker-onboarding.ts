/**
 * Clean only one SAN-1092 broker E2E run. Do not assume an Auth delete cascades
 * through app-owned rental tables; deleting the user first can orphan rows.
 */
import type { deleteThrowawayIdentity, getSupabaseAdmin, ThrowawayIdentity } from "./auth";

type Admin = Awaited<ReturnType<typeof getSupabaseAdmin>>;
type DeleteIdentity = typeof deleteThrowawayIdentity;

export async function cleanupBrokerOnboarding(
  admin: Admin,
  identity: ThrowawayIdentity,
  removeIdentity: DeleteIdentity,
): Promise<void> {
  const { data: profiles, error: profileReadError } = await admin
    .from("landlord_profiles")
    .select("id")
    .eq("user_id", identity.userId);
  if (profileReadError) throw new Error(`Find test broker profile: ${profileReadError.message}`);

  const profileIds = (profiles ?? []).map(({ id }) => id);
  if (profileIds.length > 0) {
    const { data: listings, error: listingReadError } = await admin
      .from("apartments")
      .select("id")
      .in("landlord_id", profileIds);
    if (listingReadError) throw new Error(`Find test broker listings: ${listingReadError.message}`);

    const listingIds = (listings ?? []).map(({ id }) => id);
    if (listingIds.length > 0) {
      const { error } = await admin
        .from("apartments")
        .delete()
        .in("id", listingIds)
        .in("landlord_id", profileIds);
      if (error) throw new Error(`Delete test broker listings: ${error.message}`);

      // Verify the exact IDs, not just a count or an HTTP 204.
      const remaining = await admin.from("apartments").select("id").in("id", listingIds);
      if (remaining.error || (remaining.data ?? []).length > 0) {
        throw new Error(`Test broker listings remain: ${remaining.error?.message ?? remaining.data?.length}`);
      }
    }

    const { error: profileDeleteError } = await admin
      .from("landlord_profiles")
      .delete()
      .eq("user_id", identity.userId)
      .in("id", profileIds);
    if (profileDeleteError) throw new Error(`Delete test broker profile: ${profileDeleteError.message}`);
  }

  const remainingProfiles = await admin.from("landlord_profiles").select("id").eq("user_id", identity.userId);
  if (remainingProfiles.error || (remainingProfiles.data ?? []).length > 0) {
    throw new Error(`Test broker profile remains: ${remainingProfiles.error?.message ?? remainingProfiles.data?.length}`);
  }

  // Existing helper deletes Mastra activity and the auth user, then verifies
  // the app profile is gone. Keep identity until rental cleanup is proven.
  await removeIdentity(identity);
}
