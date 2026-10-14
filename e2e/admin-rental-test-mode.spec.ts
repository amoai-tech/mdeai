import { expect, test } from "@playwright/test";
import { getSupabaseAdmin, hasE2eEnv, signInAsOnOrigin } from "./helpers/auth";
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
  let cleaned = false;
  try {
    await page.goto("/admin/rentals");
    await expect(page.getByTestId("admin-rental-test-panel")).toBeVisible();
    await page.getByTestId("admin-test-title").fill(`E2E internal rental ${Date.now()}`);
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
  } finally {
    if (fixtureId && !cleaned) {
      const response = await page.request.post("/api/admin/rentals/test", {
        data: { action: "cleanup", apartmentId: fixtureId },
      });
      if (!response.ok()) throw new Error("Test fixture cleanup failed; review this fixture ID in the test run logs");
    }
  }
});
