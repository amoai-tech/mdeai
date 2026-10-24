import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";

test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});

/**
 * SAN-1578 — the /app rentals adapter reuses the existing concierge and
 * listings page bodies with an /app route family. A landlord fixture is the
 * smallest identity the broker gate accepts.
 */
test.describe("SAN-1578 /app rentals", { tag: ["@app", "@rentals"] }, () => {
  // Cold dev compilation of both broker routes takes ~50s in CI shards.
  test.setTimeout(120_000);
  test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

  test("landlord opens the concierge and listings under /app", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const identity = await createThrowawayIdentity("san1578-landlord");
    const admin = await getSupabaseAdmin();

    try {
      // A signed-in newcomer can complete setup entirely within the /app route.
      await signInAsOnOrigin(page, origin, identity.email);
      await page.goto("/app/rentals");
      await expect(page).toHaveURL(/\/app\/rentals\/onboarding$/);
      await expect(page.getByTestId("rentals-onboarding")).toBeVisible();
      await expect(page.getByTestId("ro-ack")).toHaveCount(0);

      const landlord = await admin.from("landlord_profiles").insert({
        user_id: identity.userId,
        display_name: "SAN-1578 QA Landlord",
      });
      expect(landlord.error, landlord.error?.message).toBeNull();

      await signInAsOnOrigin(page, origin, identity.email);

      await page.goto("/app");
      const rentalsCard = page.getByTestId("workspace-card-rentals");
      await expect(rentalsCard).toBeVisible();
      await expect(rentalsCard.getByRole("link", { name: "Open" })).toHaveAttribute(
        "href",
        "/app/rentals",
      );

      await page.goto("/app/rentals");
      await expect(page.getByTestId("rentals-concierge")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Your rentals, run by AI" }),
      ).toBeVisible();
      await expect(
        page.getByTestId("host-rentals-nav-listings"),
      ).toHaveAttribute("href", "/app/rentals/listings");

      await page.goto("/app/rentals/listings");
      const visibleWorkspace = page.locator("#main-content");
      await expect(visibleWorkspace.getByTestId("rentals-listings")).toBeVisible();
      // /app already provides the sole main landmark. A nested main is invalid.
      await expect(page.locator("main")).toHaveCount(1);

      // An existing broker with no inventory must be able to add a first unit;
      // the old redirect loop sent "Start onboarding" back to /app/rentals.
      // Next.js may retain a hidden route tree during navigation. Only the
      // active /app account main is the user's visible workspace.
      await expect(visibleWorkspace.getByTestId("rentals-listings-empty")).toBeVisible();
      await visibleWorkspace.getByTestId("rentals-listings-onboarding").click();
      await expect(page).toHaveURL(/\/app\/rentals\/onboarding$/);
      await expect(page.getByTestId("host-rentals-onboarding")).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);

      // Submit an explicitly synthetic development draft through the real
      // browser/server-action/RPC path, and prove the persisted result.
      const draftAddress = `SAN-1578 QA TEST ${identity.userId.slice(0, 8)} (not a real property)`;
      await page.locator("#ro-display-name").fill("SAN-1578 QA Landlord");
      await page.getByRole("button", { name: "Laureles", exact: true }).click();
      await page.getByRole("button", { name: "Continue →" }).click();
      await expect(page.getByTestId("ro-step-listing")).toBeVisible();
      await page.locator("#ro-address").fill(draftAddress);
      await page.locator("#ro-bedrooms").fill("2");
      await page.locator("#ro-bathrooms").fill("1");
      await page.locator("#ro-rent").fill("2400000");
      await page.getByRole("button", { name: "Continue →" }).click();
      await expect(page.getByTestId("ro-step-review")).toBeVisible();
      await page.getByTestId("ro-submit").click();
      await expect(page).toHaveURL(/\/app\/rentals\/listings$/, { timeout: 45_000 });

      const { data: profile, error: profileError } = await admin
        .from("landlord_profiles")
        .select("id")
        .eq("user_id", identity.userId)
        .single();
      expect(profileError).toBeNull();
      expect(profile).toBeTruthy();
      const { data: drafts, error: draftError } = await admin
        .from("apartments")
        .select("id, title, address, price_monthly, listing_workflow_status")
        .eq("landlord_id", profile!.id);
      expect(draftError).toBeNull();
      const draft = drafts?.find((row) => row.address === draftAddress);
      expect(draft, "draft must be stored, not just displayed optimistically").toBeTruthy();
      expect(draft?.listing_workflow_status).toBe("draft");
      expect(draft?.price_monthly).toBe(2_400_000);

      // The same persisted broker path must remain usable on a 390px phone.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/app/rentals/onboarding");
      await expect(page.getByTestId("rentals-onboarding")).toBeVisible();
      await page.goto("/app/rentals/listings");
      await expect(page.locator("#main-content").getByTestId("rentals-listings")).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      const widths = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        screen: window.innerWidth,
      }));
      expect(widths.page, "no horizontal scrolling at 390px").toBeLessThanOrEqual(widths.screen);

      await page.goto("/app/rentals");
      await expect(page).toHaveURL(/\/app\/rentals$/);
      await expect(page.getByTestId("rentals-concierge")).toBeVisible();
    } finally {
      // Both the pre-created broker and its real server-created draft must be
      // cleaned up before the auth user. Check errors instead of claiming
      // cleanup succeeded after a UI assertion alone.
      const { data: profiles, error: findError } = await admin
        .from("landlord_profiles")
        .select("id")
        .eq("user_id", identity.userId);
      const cleanupErrors: string[] = [];
      if (findError) cleanupErrors.push(findError.message);
      for (const profile of profiles ?? []) {
        const { error } = await admin.from("apartments").delete().eq("landlord_id", profile.id);
        if (error) cleanupErrors.push(error.message);
      }
      const profileIds = (profiles ?? []).map((profile) => profile.id);
      const { error: profileDeleteError } = await admin
        .from("landlord_profiles")
        .delete()
        .eq("user_id", identity.userId);
      if (profileDeleteError) cleanupErrors.push(profileDeleteError.message);
      if (profileIds.length) {
        const { count, error } = await admin.from("apartments")
          .select("id", { count: "exact", head: true })
          .in("landlord_id", profileIds);
        if (error) cleanupErrors.push(error.message);
        if (count !== 0) cleanupErrors.push(`apartment cleanup left ${count} rows`);
      }
      try {
        await deleteThrowawayIdentity(identity);
      } catch (error) {
        cleanupErrors.push(String(error));
      }
      const { count: remaining, error: remainingError } = await admin
        .from("landlord_profiles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", identity.userId);
      if (remainingError) cleanupErrors.push(remainingError.message);
      if (remaining !== 0) cleanupErrors.push(`profile cleanup left ${remaining} rows`);
      expect(cleanupErrors, "temporary QA records must be completely deleted").toEqual([]);
    }
  });
});
