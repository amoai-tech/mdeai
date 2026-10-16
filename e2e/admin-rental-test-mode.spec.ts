import { expect, test } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "./helpers/auth";
import { nextMedellinTestViewingWallClock } from "@/lib/leads/schedule-viewing-time";

/**
 * Admin rental integration proof, opt-in only: creates and removes live DB rows.
 * Run against an approved local/preview target with a REAL administrator:
 *   MDE_ADMIN_RENTAL_E2E=1 MDE_ADMIN_RENTAL_E2E_EMAIL=<admin> \
 *     SMOKE_BASE_URL=http://localhost:3001 npx playwright test \
 *     e2e/admin-rental-test-mode.spec.ts --project=chromium --retries=0
 * Never run automatically against customer production; no auth/service keys enter browser code.
 */
const optIn = process.env.MDE_ADMIN_RENTAL_E2E === "1";
const email = process.env.MDE_ADMIN_RENTAL_E2E_EMAIL;
const origin = process.env.PROD_SMOKE_BASE_URL ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3001";

test("admin test rental: create, publish, view, retry, cleanup without duplicates", async ({ page }) => {
  test.skip(!optIn, "Intentional DB writes require MDE_ADMIN_RENTAL_E2E=1");
  if (!email || !hasE2eEnv()) throw new Error("Admin E2E requires admin email and Supabase test credentials");
  await signInAsOnOrigin(page, origin, email);
  const admin = await getSupabaseAdmin();
  let fixtureId: string | undefined;
  const fixtureTitle = `E2E internal rental ${Date.now()}`;
  let cleaned = false;
  let primaryError: unknown;
  try {
    await page.goto("/admin/rentals");
    await expect(page.getByTestId("admin-rental-test-panel")).toBeVisible();
    await page.getByTestId("admin-test-title").fill(fixtureTitle);
    await page.getByTestId("admin-test-availableFrom").fill(nextMedellinTestViewingWallClock().slice(0, 10));
    await page.getByTestId("admin-test-imageUrl").fill("https://example.com/authorized-test-photo.jpg");

    const createResponse = page.waitForResponse((res) => res.url().endsWith("/api/admin/rentals/test") && res.request().method() === "POST");
    await page.getByTestId("admin-test-create").click();
    const created = await (await createResponse).json() as { rental?: { id?: string } };
    fixtureId = created.rental?.id;
    expect(fixtureId).toBeTruthy();
    await expect(page.getByTestId(`admin-test-publish-${fixtureId}`)).toBeVisible();
    await page.getByTestId(`admin-test-publish-${fixtureId}`).click();
    await expect(page.getByTestId(`admin-test-viewing-${fixtureId}`)).toBeEnabled();

    const requestViewing = async () => {
      const responsePromise = page.waitForResponse((res) => res.url().endsWith("/api/admin/rentals/test") && res.request().method() === "POST");
      await page.getByTestId(`admin-test-viewing-${fixtureId}`).click();
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      return (await response.json()) as { leadId: string; showingId: string };
    };
    const first = await requestViewing();
    const retry = await requestViewing();
    expect(retry).toEqual(first);

    const leads = await admin.from("leads").select("id").eq("apartment_id", fixtureId!);
    const showings = await admin.from("showings").select("id").eq("apartment_id", fixtureId!);
    expect(leads.error).toBeNull();
    expect(showings.error).toBeNull();
    expect(leads.data).toHaveLength(1);
    expect(showings.data).toHaveLength(1);

    await page.getByTestId(`admin-test-cleanup-${fixtureId}`).click();
    await expect(page.getByTestId("admin-test-message")).toContainText("returned to draft");
    const [postLeads, postShowings] = await Promise.all([
      admin.from("leads").select("id").eq("apartment_id", fixtureId!),
      admin.from("showings").select("id").eq("apartment_id", fixtureId!),
    ]);
    expect(postLeads.error).toBeNull();
    expect(postShowings.error).toBeNull();
    expect(postLeads.data).toHaveLength(0);
    expect(postShowings.data).toHaveLength(0);
    cleaned = true;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (fixtureId) {
      try {
        if (!cleaned) {
          const response = await page.request.post("/api/admin/rentals/test", {
            data: { action: "cleanup", apartmentId: fixtureId },
          });
          if (!response.ok()) {
            throw new Error(`Fixture ${fixtureId} cleanup failed; do not delete unclassified records`);
          }
        }
        // The RPC intentionally retains the draft for interactive admins.
        // This E2E owns a uniquely titled fixture, so remove that draft as well.
        // Never delete an existing/unrelated listing based only on a returned UUID.
        const { data: owned, error: lookupError } = await admin.from("apartments")
          .select("id,title,metadata,status,listing_workflow_status")
          .eq("id", fixtureId).maybeSingle();
        if (lookupError || !owned || owned.title !== fixtureTitle
          || String((owned.metadata as Record<string, unknown> | null)?.is_test_fixture) !== "true"
          || owned.status !== "inactive" || owned.listing_workflow_status !== "draft") {
          throw new Error(`Fixture ${fixtureId} failed ownership/draft verification; no deletion performed`);
        }
        const [leadsBeforeDelete, showingsBeforeDelete] = await Promise.all([
          admin.from("leads").select("id").eq("apartment_id", fixtureId),
          admin.from("showings").select("id").eq("apartment_id", fixtureId),
        ]);
        if (leadsBeforeDelete.error || showingsBeforeDelete.error
          || leadsBeforeDelete.data?.length || showingsBeforeDelete.data?.length) {
          throw new Error(`Fixture ${fixtureId} still has viewing records; no deletion performed`);
        }
        const { data: deleted, error: deleteError } = await admin.from("apartments")
          .delete().eq("id", fixtureId).select("id");
        if (deleteError || deleted?.length !== 1 || deleted[0]?.id !== fixtureId) {
          throw new Error(`Could not delete the owned fixture ${fixtureId}`);
        }
        const [apartments, leadsAfterDelete, showingsAfterDelete] = await Promise.all([
          admin.from("apartments").select("id").eq("id", fixtureId),
          admin.from("leads").select("id").eq("apartment_id", fixtureId),
          admin.from("showings").select("id").eq("apartment_id", fixtureId),
        ]);
        for (const result of [apartments, leadsAfterDelete, showingsAfterDelete]) {
          if (result.error || result.data?.length !== 0) {
            throw new Error(`Fixture ${fixtureId} left residual rows after deletion`);
          }
        }
      } catch (cleanupError) {
        if (primaryError !== undefined) {
          throw new AggregateError([primaryError, cleanupError],
            `Rental test and fixture ${fixtureId} cleanup both failed`);
        }
        throw cleanupError;
      }
    }
  }
});

/**
 * SAN-1502 PR 1 — the new development controls through the real admin UI, at a
 * desktop and a mobile viewport: grant access -> approve -> withdraw publishing
 * -> audit trail -> revoke. Opt-in for the same reason as the journey above.
 *
 * The audit trail is append-only by design, so the events these runs create are
 * intentionally retained; every fixture, lead and showing is removed.
 */
const DEVELOPMENT_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const viewport of DEVELOPMENT_VIEWPORTS) {
  test(`admin development controls: grant, approve, revoke and audit (${viewport.name})`, async ({ page }) => {
    test.skip(!optIn, "Intentional DB writes require MDE_ADMIN_RENTAL_E2E=1");
    if (!email || !hasE2eEnv()) throw new Error("Admin E2E requires admin email and Supabase test credentials");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signInAsOnOrigin(page, origin, email);
    const admin = await getSupabaseAdmin();
    const tester = await createThrowawayIdentity(`san1502-${viewport.name}`);
    let fixtureId: string | undefined;
    const fixtureTitle = `E2E dev controls ${viewport.name} ${Date.now()}`;
    try {
      await page.goto("/admin/rentals");
      await expect(page.getByTestId("admin-rental-test-panel")).toBeVisible();
      await page.getByTestId("admin-test-title").fill(fixtureTitle);
      await page.getByTestId("admin-test-availableFrom").fill(nextMedellinTestViewingWallClock().slice(0, 10));
      await page.getByTestId("admin-test-imageUrl").fill("https://example.com/authorized-test-photo.jpg");

      const createResponse = page.waitForResponse((res) => res.url().endsWith("/api/admin/rentals/test") && res.request().method() === "POST");
      await page.getByTestId("admin-test-create").click();
      fixtureId = (await (await createResponse).json() as { rental?: { id?: string } }).rental?.id;
      expect(fixtureId).toBeTruthy();

      // Grant a distinct test identity development access through the UI.
      await page.getByTestId("admin-test-access-userId").fill(tester.userId);
      await page.getByTestId("admin-test-access-role").selectOption("renter");
      await page.getByTestId("admin-test-access-grant").click();
      await expect(page.getByTestId("admin-test-message")).toContainText("granted");
      await expect(page.getByTestId(`admin-test-access-revoke-${tester.userId}-renter`)).toBeVisible();

      // Approve, then withdraw publishing so it is no longer offered to testers.
      await page.getByTestId(`admin-test-approve-${fixtureId}`).click();
      await expect(page.getByTestId("admin-test-message")).toContainText("approved");
      await expect(page.getByTestId(`admin-test-publish-right-${fixtureId}`)).toContainText("Withdraw publishing");
      await page.getByTestId(`admin-test-publish-right-${fixtureId}`).click();
      await expect(page.getByTestId("admin-test-message")).toContainText("no longer offered");

      // The audit trail records both transitions, in the database and on screen.
      const events = await admin.from("rental_test_events").select("event_type").eq("apartment_id", fixtureId!);
      expect(events.error).toBeNull();
      const types = (events.data ?? []).map((row) => row.event_type);
      expect(types).toContain("listing_approved");
      expect(types).toContain("publishing_rights_set");
      await expect(page.getByTestId("admin-test-events").getByText("listing_approved")).toBeVisible();

      await page.getByTestId(`admin-test-access-revoke-${tester.userId}-renter`).click();
      await expect(page.getByTestId("admin-test-message")).toContainText("revoked");
    } finally {
      try {
        if (fixtureId) {
          await page.request.post("/api/admin/rentals/test", {
            data: { action: "cleanup", apartmentId: fixtureId },
          });
          // Never delete based on a returned UUID alone: prove this run owns the row.
          const { data: owned, error: lookupError } = await admin.from("apartments")
            .select("id,title,metadata,status,listing_workflow_status")
            .eq("id", fixtureId).maybeSingle();
          if (lookupError || !owned || owned.title !== fixtureTitle
            || String((owned.metadata as Record<string, unknown> | null)?.is_test_fixture) !== "true"
            || owned.status !== "inactive" || owned.listing_workflow_status !== "draft") {
            throw new Error(`Fixture ${fixtureId} failed ownership/draft verification; no deletion performed`);
          }
          const { error: deleteError } = await admin.from("apartments").delete().eq("id", fixtureId);
          if (deleteError) throw deleteError;
        }
      } finally {
        await deleteThrowawayIdentity(tester);
      }
    }
  });
}
