import { expect, test, type Locator, type Page } from "@playwright/test";
import { hasE2eEnv, signInAsOnOrigin } from "./helpers/auth";

/**
 * SAN-1543 · admin bulk nominee journey.
 *
 * Opt-in only, and it writes. Point it at a DEDICATED development contest, never at a live one.
 *
 *   MDE_ADMIN_CONTEST_E2E=1 MDE_ADMIN_CONTEST_E2E_EMAIL=<admin> \
 *   MDE_ADMIN_CONTEST_E2E_CONTEST_ID=<dedicated dev contest> SMOKE_BASE_URL=http://localhost:3001 \
 *   npx playwright test e2e/san-1543-admin-bulk.spec.ts --project=chromium --retries=0
 *
 * Unlinking does NOT delete an entry: admin_contest_unlink_restaurant sets restaurant_id = NULL and
 * admin_contest_get still returns that entity, so the entry count never shrinks. This test tracks
 * the exact restaurants it links and asserts each one's linked state. Cleanup only touches those.
 */
const optIn = process.env.MDE_ADMIN_CONTEST_E2E === "1";
const email = process.env.MDE_ADMIN_CONTEST_E2E_EMAIL;
const contestId = process.env.MDE_ADMIN_CONTEST_E2E_CONTEST_ID;
const origin = process.env.PROD_SMOKE_BASE_URL ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3001";

/**
 * The nominee row whose display name is exactly this restaurant.
 *
 * Uses getByText with exact:true (a string comparison) instead of building a RegExp from a
 * variable — that pattern is a regular-expression injection surface for no benefit here.
 */
function entryRow(page: Page, name: string): Locator {
  return page
    .locator('[data-testid^="contest-entry-"]')
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
}

async function isLinked(row: Locator): Promise<boolean> {
  return (await row.getByTestId("contest-unlink-submit").count()) > 0;
}

/** Remove one nominee through the UI, accepting the confirmation dialog. */
async function removeNominee(page: Page, name: string): Promise<void> {
  const row = entryRow(page, name);
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByTestId("contest-unlink-submit").click();
  await expect(row.getByTestId("contest-unlink-submit")).toHaveCount(0, { timeout: 30_000 });
}

function checkbox(page: Page, name: string): Locator {
  return page.locator('[data-testid="contest-picker-option"][data-restaurant-name="' + name + '"]');
}

test.describe("SAN-1543 admin nominee picker", () => {
  test.skip(!optIn, "Intentional writes require MDE_ADMIN_CONTEST_E2E=1");

  test("search, select, add and remove nominees without a keyboard modifier", async ({ page }) => {
    // Opted in but misconfigured is a FAILURE, never a silent skip: a skipped test is not a pass.
    if (!email || !contestId || !hasE2eEnv()) {
      throw new Error(
        "Admin contest E2E requires MDE_ADMIN_CONTEST_E2E_EMAIL, MDE_ADMIN_CONTEST_E2E_CONTEST_ID and Supabase test credentials",
      );
    }
    test.setTimeout(180_000);

    const linkedByTest: string[] = [];
    await signInAsOnOrigin(page, origin, email);
    await page.goto("/admin/contests/" + contestId);
    await expect(page.getByTestId("restaurant-picker")).toBeVisible();

    let bodyFailed = false;
    try {
      // 390px: the old <select multiple> needed Ctrl/Cmd and was unusable here.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId("contest-picker-search")).toBeVisible();
      await expect(page.getByTestId("contest-link-submit")).toBeDisabled();

      const options = page.getByTestId("contest-picker-option");
      expect(
        await options.count(),
        "pick a dedicated contest that still has free catalog restaurants",
      ).toBeGreaterThanOrEqual(2);

      const first = (await options.nth(0).getAttribute("data-restaurant-name")) ?? "";
      const second = (await options.nth(1).getAttribute("data-restaurant-name")) ?? "";
      expect(first && second && first !== second).toBeTruthy();

      // Search narrows the list without clearing an existing selection.
      await page.getByTestId("contest-picker-search").fill(first.slice(0, 4));
      await checkbox(page, first).check();
      await expect(page.getByTestId("contest-picker-count")).toHaveText("1 selected");
      await page.getByTestId("contest-picker-search").fill("");
      await expect(page.getByTestId("contest-picker-count")).toHaveText("1 selected");
      await checkbox(page, second).check();
      await expect(page.getByTestId("contest-picker-count")).toHaveText("2 selected");

      // Tracked BEFORE the write: if the submission partially succeeds and an assertion below
      // fails, cleanup still knows which nominees to restore.
      linkedByTest.push(first, second);
      await page.getByTestId("contest-link-submit").click();
      await expect(page.getByTestId("contest-link-result-summary")).toContainText("2 added", {
        timeout: 30_000,
      });

      for (const name of [first, second]) {
        await expect.poll(() => isLinked(entryRow(page, name)), { timeout: 30_000 }).toBe(true);
      }

      // Cancelling the confirmation must write nothing.
      page.once("dialog", (dialog) => dialog.dismiss());
      await entryRow(page, first).getByTestId("contest-unlink-submit").click();
      await expect.poll(() => isLinked(entryRow(page, first))).toBe(true);

      // Remove only the two restaurants this test added.
      for (const name of [first, second]) {
        await removeNominee(page, name);
        linkedByTest.splice(linkedByTest.indexOf(name), 1);
      }
    } catch (error) {
      // Remember that the body failed so cleanup cannot replace the real failure below.
      bodyFailed = true;
      throw error;
    } finally {
      // Guaranteed restoration: unlink anything this test left linked, and report if that fails.
      const cleanupFailures: string[] = [];
      for (const name of linkedByTest) {
        try {
          if (await isLinked(entryRow(page, name))) await removeNominee(page, name);
        } catch (error) {
          cleanupFailures.push(name + ": " + (error instanceof Error ? error.message : String(error)));
        }
      }
      if (cleanupFailures.length > 0) {
        const message = "E2E cleanup failed — check these nominees by hand: " + cleanupFailures.join("; ");
        // The body failure is the one that explains the run; a cleanup error must not mask it.
        if (bodyFailed) console.error(message);
        else throw new Error(message);
      }
    }
  });
});