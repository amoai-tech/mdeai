import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { getTestSession, getSupabaseAdmin, hasE2eEnv } from "../helpers/auth";
import {
  asUser,
  cleanupFixture,
  findResidue,
  provisionFixture,
} from "../helpers/rental-journey-fixture";
import { setAuditUserId } from "@/mastra/lib/tool-audit-context";
import { HOST_SUPABASE_KEY } from "@/mastra/tools/hostops-read-tools";
import { readBrokerWorkspaceTool } from "@/mastra/tools/read-broker-workspace";

/**
 * Opt-in security proof on the real Supabase project.
 *
 * Existing SAN-1205 throwaway fixture owns setup, teardown and zero-residue
 * readback. The agent tool runs with each actor's OWN Supabase JWT, not an
 * admin/service-role client. Never run this in ordinary PR CI.
 */
test.describe("SAN-1124 broker AI tenant isolation", () => {
  test.setTimeout(120_000);
  test.skip(
    !hasE2eEnv() || process.env.MDE_BROKER_AI_LIVE !== "1",
    "Needs intentional live DB test with throwaway accounts",
  );

  test("private broker tool excludes foreign listings and rejects guest", async () => {
    const lookup = z.object({ listings: z.array(z.object({ id: z.string() })) });
    const admin = await getSupabaseAdmin();
    const fixture = await provisionFixture(admin, randomUUID().slice(0, 8));
    try {
      const [ownerSession, otherSession] = await Promise.all([
        getTestSession(fixture.owner.email),
        getTestSession(fixture.other.email),
      ]);
      const owner = asUser(ownerSession);
      const other = asUser(otherSession);

      const runAs = async (
        userId: string,
        supabase: ReturnType<typeof asUser>,
      ) => {
        const requestContext = new RequestContext();
        setAuditUserId(requestContext, userId);
        requestContext.set(HOST_SUPABASE_KEY, supabase);
        return lookup.parse(await readBrokerWorkspaceTool.execute!(
          { focus: "listings" },
          { requestContext } as never,
        ));
      };

      // Invoke the actual Mastra tool with the real JWT-scoped clients.
      const own = await runAs(fixture.owner.userId, owner);
      expect(own.listings.map(({ id }) => id)).toContain(fixture.apartmentId);

      const foreign = await runAs(fixture.other.userId, other);
      expect(foreign.listings.map(({ id }) => id)).not.toContain(fixture.apartmentId);

      // Published development inventory is deliberately public to browse.
      // The broker management tool MUST NOT treat a public listing as owned.
      const { data, error } = await other.from("apartments")
        .select("id").eq("id", fixture.apartmentId);
      expect(error).toBeNull();
      expect(data?.map((row) => row.id)).toContain(fixture.apartmentId);

      // Even with the other broker's ID in context, the owner's JWT cannot
      // be converted into a different broker's private data by the model.
      await expect(runAs(fixture.other.userId, owner))
        .rejects.toThrow(/rental profile/);

      await expect(readBrokerWorkspaceTool.execute!(
        { focus: "listings" },
        { requestContext: new RequestContext() } as never,
      )).rejects.toThrow(/Sign in/);

      // AI was read-only; confirm the exact seeded apartment remains unchanged.
      const { data: after, error: afterError } = await admin.from("apartments")
        .select("id, title, landlord_id, listing_workflow_status")
        .eq("id", fixture.apartmentId).single();
      expect(afterError).toBeNull();
      expect(after).toMatchObject({
        id: fixture.apartmentId,
        title: fixture.title,
        landlord_id: fixture.ownerProfileId,
        listing_workflow_status: "published",
      });
    } finally {
      const errors = await cleanupFixture(admin, fixture);
      const residue = await findResidue(admin, fixture);
      expect([...errors, ...residue], "no real test records left behind").toEqual([]);
    }
  });
});
