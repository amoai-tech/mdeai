import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  loadEnvLocalForE2E,
  type ThrowawayIdentity,
} from "../helpers/auth";
import { cleanupFixtures, createPartner } from "../helpers/partner-fixtures";

// SAN-1441: real Supabase/JWT/RLS proof; deliberately NO browser mocks,
// service-role user requests, or pre-existing customers' records.
// The service role creates/deletes ONLY labeled disposable QA fixtures.
test.use({ screenshot: "off", trace: "off", video: "off" });
test.describe("SAN-1441 · Two-user partner data isolation", () => {
  test.skip(!hasE2eEnv(), "Real signed-in Supabase QA credentials required");
  test.setTimeout(180_000);

  test("Ana and Carlos cannot cross-read, cross-write or self-grant a role; revocation is immediate", async () => {
    loadEnvLocalForE2E();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase public client environment missing");

    const admin = await getSupabaseAdmin();
    const identities: ThrowawayIdentity[] = [];
    const partnerIds: string[] = [];

    try {
      const ana = await createThrowawayIdentity("san1441-ana");
      identities.push(ana);
      const carlos = await createThrowawayIdentity("san1441-carlos");
      identities.push(carlos);

      const north = await createPartner(admin, ana.userId, "venue", {
        businessName: "SAN1441 Ana North",
        description: "Ana only private testing data",
      });
      partnerIds.push(north);
      const south = await createPartner(admin, ana.userId, "developer", {
        businessName: "SAN1441 Ana South",
        description: "Ana second business",
      });
      partnerIds.push(south);
      const carlosPartner = await createPartner(admin, carlos.userId, "venue", {
        businessName: "SAN1441 Carlos",
        description: "Carlos only private testing data",
      });
      partnerIds.push(carlosPartner);

      const [anaSession, carlosSession] = await Promise.all([
        getTestSession(ana.email, { requireExisting: true }),
        getTestSession(carlos.email, { requireExisting: true }),
      ]);
      expect(anaSession.user.id).toBe(ana.userId);
      expect(carlosSession.user.id).toBe(carlos.userId);
      expect(anaSession.user.id).not.toBe(carlosSession.user.id);

      const scopedClient = (accessToken: string) => createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const clientAna = scopedClient(anaSession.access_token);
      const clientCarlos = scopedClient(carlosSession.access_token);
      const anonymous = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const ids = [north, south, carlosPartner];
      const [anaRows, carlosRows, anonRows] = await Promise.all([
        clientAna.from("partners").select("id, settings").in("id", ids),
        clientCarlos.from("partners").select("id, settings").in("id", ids),
        anonymous.from("partners").select("id, settings").in("id", ids),
      ]);
      for (const response of [anaRows, carlosRows, anonRows]) {
        expect(response.error, response.error?.message).toBeNull();
      }
      expect(new Set((anaRows.data ?? []).map((x) => x.id))).toEqual(new Set([north, south]));
      expect((carlosRows.data ?? []).map((x) => x.id)).toEqual([carlosPartner]);
      expect(anonRows.data).toEqual([]);

      const [anaMemberships, carlosMemberships] = await Promise.all([
        clientAna.from("partner_members").select("partner_id").in("partner_id", ids),
        clientCarlos.from("partner_members").select("partner_id").in("partner_id", ids),
      ]);
      expect(anaMemberships.error).toBeNull();
      expect(carlosMemberships.error).toBeNull();
      expect(new Set((anaMemberships.data ?? []).map((x) => x.partner_id)))
        .toEqual(new Set([north, south]));
      expect((carlosMemberships.data ?? []).map((x) => x.partner_id))
        .toEqual([carlosPartner]);

      // An RLS-filtered UPDATE may return success but mutate ZERO rows:
      // always verify the actual saved data using the trusted QA setup client.
      const stolenUpdate = await clientCarlos.from("partners")
        .update({ settings: { businessName: "STOLEN" } })
        .eq("id", north)
        .select("id");
      expect((stolenUpdate.data ?? []).length).toBe(0);
      // A missing table grant may return 42501 instead of zero rows.
      if (stolenUpdate.error) expect(stolenUpdate.error.code).toBe("42501");

      const unauthorizedRole = await clientCarlos.from("user_roles")
        .insert({ user_id: carlos.userId, role: "super_admin" })
        .select("id");
      expect((unauthorizedRole.data ?? []).length).toBe(0);
      expect(unauthorizedRole.error).not.toBeNull();

      const membershipMutation = await clientCarlos.from("partner_members")
        .update({ role: "owner" })
        .eq("partner_id", north)
        .eq("profile_id", ana.userId)
        .select("partner_id");
      expect((membershipMutation.data ?? []).length).toBe(0);
      if (membershipMutation.error) expect(membershipMutation.error.code).toBe("42501");

      const unchanged = await admin.from("partners").select("id, settings").in("id", ids);
      expect(unchanged.error).toBeNull();
      expect((unchanged.data ?? []).find((x) => x.id === north)?.settings)
        .toMatchObject({ businessName: "SAN1441 Ana North" });

      // Grant then revoke Carlo's *staff* membership on Ana's North.
      // Ana also has partners.profile_id ownership authority, so deleting
      // her own membership would NOT represent revoking all owner rights.
      const staffGrant = await admin.from("partner_members").insert({
        profile_id: carlos.userId, partner_id: north, role: "staff",
      });
      expect(staffGrant.error).toBeNull();
      const staffView = await clientCarlos.from("partners")
        .select("id").eq("id", north);
      expect(staffView.error).toBeNull();
      expect(staffView.data).toEqual([{ id: north }]);

      // Ordinary business membership must not authorize reassignment of its
      // owner; otherwise a staff member can keep access after revocation.
      const takeover = await clientCarlos.from("partners")
        .update({ profile_id: carlos.userId })
        .eq("id", north).select("id");
      expect(takeover.data ?? []).toEqual([]);
      expect(takeover.error?.code).toBe("42501");

      const revoked = await admin.from("partner_members").delete()
        .eq("profile_id", carlos.userId).eq("partner_id", north);
      expect(revoked.error).toBeNull();
      // Old JWT stays valid, but membership-dependent data access vanishes.
      const afterRevoke = await clientCarlos.from("partners")
        .select("id").eq("id", north);
      expect(afterRevoke.error).toBeNull();
      expect(afterRevoke.data).toEqual([]);
      const staleWrite = await clientCarlos.from("partners")
        .update({ settings: { businessName: "REVOKED WRITE" } })
        .eq("id", north).select("id");
      expect(staleWrite.data ?? []).toEqual([]);
      if (staleWrite.error) expect(staleWrite.error.code).toBe("42501");

      const anaStillOwns = await clientAna.from("partners")
        .select("id").in("id", [north, south]);
      expect(anaStillOwns.error).toBeNull();
      expect(new Set((anaStillOwns.data ?? []).map((r) => r.id)))
        .toEqual(new Set([north, south]));
      const carlosStillOwns = await clientCarlos.from("partners")
        .select("id").eq("id", carlosPartner);
      expect(carlosStillOwns.error).toBeNull();
      expect(carlosStillOwns.data).toEqual([{ id: carlosPartner }]);
    } finally {
      await cleanupFixtures(admin, partnerIds, identities);
    }
  });
});
