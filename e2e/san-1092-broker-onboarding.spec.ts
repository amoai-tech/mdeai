/**
 * SAN-1092 · RE-DES-005 — Broker onboarding wizard (Class U proof).
 *
 *   # Explicit real database opt-in; default E2E skips this write-bearing test.
 *   ALLOW_PROD_CERTIFICATION=1 npm run test:e2e:broker-onboarding
 */
import { test as base, expect, type Page } from "@playwright/test";
import {
  watchCriticalConsoleErrors,
  assertConsoleClean,
} from "./helpers/screen-evidence";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  type ThrowawayIdentity,
  hasE2eEnv,
  injectSession,
  getTestSession,
} from "./helpers/auth";
import { cleanupBrokerOnboarding } from "./helpers/cleanup-broker-onboarding";

// Use Playwright's fixture teardown, which still runs after assertion failure or
// a timed-out test. Never depend on reaching the end of the test body to clean
// up real Supabase records. The single broker spec opts into this fixture.
type BrokerFixture = {
  admin: Awaited<ReturnType<typeof getSupabaseAdmin>>;
  identity: ThrowawayIdentity;
};
const test = base.extend<{ qaBroker: BrokerFixture }>({
  qaBroker: async ({}, runFixture) => {
    const admin = await getSupabaseAdmin();
    const identity = await createThrowawayIdentity("qa-broker-onboarding");
    try {
      await runFixture({ admin, identity });
    } finally {
      await cleanupBrokerOnboarding(admin, identity, deleteThrowawayIdentity);
    }
  },
});

// Authenticated screenshots can contain private data and sessions; never put
// them under tracked docs. Only an explicit local opt-in captures test artifacts.
async function captureEvidence(page: Page, filename: string): Promise<void> {
  if (process.env.BROKER_E2E_CAPTURE_SCREENSHOTS !== "1") return;
  await page.screenshot({ path: test.info().outputPath(filename), fullPage: true });
}

// skipcq: JS-0067
async function hideCpkInspector(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "#cpk-web-inspector { display: none !important; }",
  });
}

test.use({ viewport: { width: 1360, height: 900 }, trace: "off", screenshot: "off", video: "off" });

test.describe("SAN-1092 · RE-DES-005 broker onboarding", () => {
  test.beforeEach(() => {
    test.skip(process.env.RUN_REAL_BROKER_ONBOARDING !== "1", "Opt in with test:e2e:broker-onboarding; creates real QA database records");
    expect(hasE2eEnv(), "Real broker E2E requires Supabase public and admin credentials").toBe(true);
  });

  test("new broker completes wizard → listings + DB rows", async ({ page, qaBroker }) => {
    test.setTimeout(240_000);
    const errors = watchCriticalConsoleErrors(page);
    const { admin, identity } = qaBroker;
    const userId = identity.userId;
    const email = identity.email;
    const displayName = `[QA DELETE] Broker ${userId.slice(0, 8)}`;

    const { data: existingProfile } = await admin
      .from("landlord_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    expect(existingProfile).toBeNull();

    const session = await getTestSession(email);
    await injectSession(page.context(), session);
    await hideCpkInspector(page);

    await page.goto("/host/rentals/onboarding", { waitUntil: "load" });
    await expect(page.locator('[data-testid="rentals-onboarding"]')).toBeVisible();
    await captureEvidence(page, "SAN-1092-onboarding-step1.png");

    await page.locator("#ro-display-name").fill(displayName);
    await page.getByRole("button", { name: "Laureles" }).click();
    // Fail promptly on invalid form state rather than waiting 4 minutes for a
    // disabled button. Slow Next.js hydration can otherwise lose the first click.
    const continueButton = page.getByRole("button", { name: "Continue →" });
    await expect(continueButton).toBeEnabled({ timeout: 15_000 });
    await continueButton.click();
    await expect(page.locator('[data-testid="ro-step-listing"]')).toBeVisible();
    await captureEvidence(page, "SAN-1092-onboarding-step2.png");

    await page.locator("#ro-address").fill("72 10th Street, Laureles");
    await page.locator("#ro-bedrooms").fill("2");
    await page.locator("#ro-bathrooms").fill("1");
    await page.locator("#ro-rent").fill("2400000");
    await page.getByRole("button", { name: "Continue →" }).click();
    await expect(page.locator('[data-testid="ro-step-review"]')).toBeVisible();
    await captureEvidence(page, "SAN-1092-onboarding-step3.png");

    await page.locator('[data-testid="ro-submit"]').click();

    await page.waitForURL(/\/host\/rentals\/listings/, { timeout: 60_000 });
    await expect(page.locator('[data-testid="rentals-listings"]')).toBeVisible();
    await captureEvidence(page, "SAN-1092-onboarding-listings.png");

    const { data: profile } = await admin
      .from("landlord_profiles")
      .select("id, display_name, user_id")
      .eq("user_id", userId)
      .maybeSingle();
    expect(profile).not.toBeNull();
    expect(profile?.display_name).toBe(displayName);
    if (!profile) throw new Error("Broker profile was not persisted");

    const { data: apartments } = await admin
      .from("apartments")
      .select("id, landlord_id, listing_workflow_status, address, price_monthly")
      .eq("landlord_id", profile.id);
    expect((apartments ?? []).length).toBeGreaterThanOrEqual(1);
    const draft = apartments?.find((a) => a.listing_workflow_status === "draft");
    expect(draft).toBeTruthy();
    expect(draft?.price_monthly).toBe(2_400_000);

    assertConsoleClean(errors);
  });
});
