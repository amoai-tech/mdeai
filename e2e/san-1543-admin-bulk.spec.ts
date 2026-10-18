import { expect, test } from "@playwright/test";
import { hasE2eEnv, signInAsOnOrigin } from "./helpers/auth";

/**
 * SAN-1543 · admin bulk nominee journey.
 *
 * Opt-in only: it drives a REAL administrator against a REAL contest, so it links and then
 * unlinks two catalog restaurants to leave the contest exactly as it found it. Never run
 * automatically against customer production.
 *
 *   MDE_ADMIN_CONTEST_E2E=1 \
 *   MDE_ADMIN_CONTEST_E2E_EMAIL=<admin> \
 *   MDE_ADMIN_CONTEST_E2E_CONTEST_ID=<contest uuid> \
 *   SMOKE_BASE_URL=http://localhost:3001 \
 *   npx playwright test e2e/san-1543-admin-bulk.spec.ts --project=chromium --retries=0
 */
const optIn = process.env.MDE_ADMIN_CONTEST_E2E === "1";
const email = process.env.MDE_ADMIN_CONTEST_E2E_EMAIL;
const contestId = process.env.MDE_ADMIN_CONTEST_E2E_CONTEST_ID;
const origin = process.env.PROD_SMOKE_BASE_URL ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3001";

test.describe("SAN-1543 admin nominee picker", () => {
  test.skip(!optIn, "Intentional writes require MDE_ADMIN_CONTEST_E2E=1");

  test("search, select, add and remove nominees without a keyboard modifier", async ({ page }) => {
    if (!email || !contestId || !hasE2eEnv()) {
      throw new Error("Admin contest E2E requires MDE_ADMIN_CONTEST_E2E_EMAIL, CONTEST_ID and Supabase test credentials");
    }
    test.setTimeout(120_000);

    await signInAsOnOrigin(page, origin, email);
    await page.goto("/admin/contests/" + contestId);

    const picker = page.getByTestId("restaurant-picker");
    await expect(picker).toBeVisible();
    await expect(page.getByTestId("contest-picker-count")).toHaveText(/^\d+ selected$/);

    // 390px: the old <select multiple> was unusable here.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("contest-picker-search")).toBeVisible();
    await expect(page.getByTestId("contest-link-submit")).toBeDisabled();

    const options = page.getByTestId("contest-picker-option");
    const optionCount = await options.count();
    test.skip(optionCount < 2, "This contest has no free catalog restaurants to add");

    const before = await page.locator('[data-testid^="contest-entry-"]').count();

    // Search narrows the list without clearing the selection.
    await page.getByTestId("contest-picker-search").fill("a");
    await options.nth(0).check();
    await expect(page.getByTestId("contest-picker-count")).toHaveText("1 selected");
    await page.getByTestId("contest-picker-search").fill("");
    await expect(page.getByTestId("contest-picker-count")).toHaveText("1 selected");
    await options.nth(1).check();
    await expect(page.getByTestId("contest-picker-count")).toHaveText("2 selected");

    await page.getByTestId("contest-link-submit").click();
    const summary = page.getByTestId("contest-link-result-summary");
    await expect(summary).toBeVisible({ timeout: 30_000 });
    await expect(summary).toContainText("2 added");

    // The database now holds the nominees, not just the banner.
    await expect(page.locator('[data-testid^="contest-entry-"]')).toHaveCount(before + 2, {
      timeout: 30_000,
    });

    // Removing is guarded and returns the contest to its original size.
    page.on("dialog", (dialog) => dialog.accept());
    for (let i = 0; i < 2; i += 1) {
      await page.getByTestId("contest-unlink-submit").first().click();
      await expect(page.locator('[data-testid^="contest-entry-"]')).toHaveCount(before + 1 - i, {
        timeout: 30_000,
      });
    }
    await expect(page.locator('[data-testid^="contest-entry-"]')).toHaveCount(before);
  });
});