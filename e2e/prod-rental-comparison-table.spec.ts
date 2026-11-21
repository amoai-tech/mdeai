import { test, expect } from "./fixtures";

/**
 * SAN-1681 — exact-preview, signed-in proof. Read-only comparison, using the
 * same renter and CopilotKit thread throughout. No test-owned inventory,
 * service-role request, fabricated AG-UI event, or second renderer.
 *
 * Run only after checking the preview /api/version SHA:
 * MDE_COMPARE_TABLE_QA=1 PROD_SMOKE_BASE_URL=<exact verified preview> PW_SKIP_WEBSERVER=1
 *   npx playwright test e2e/prod-rental-comparison-table.spec.ts --project=prod-smoke --workers=1
 */
const enabled = process.env.MDE_COMPARE_TABLE_QA === "1";
test.use({ qaRole: "renter", trace: "off", screenshot: "off", video: "off" });
test.describe("SAN-1681 · official rental comparison A2UI Table", () => {
  test.skip(!enabled, "Explicit MDE_COMPARE_TABLE_QA=1 is required for a real AI/browser comparison.");

  for (const width of [1440, 390] as const) {
    test(`${width}px: genuine Table, no extra search, stable replacement, actions and keyboard`,
      async ({ qaRolePage: page }) => {
        test.setTimeout(300_000);
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        const response = await page.goto("/rentals", { waitUntil: "domcontentloaded" });
        expect(response?.ok()).toBe(true);

        const input = page.locator('[data-testid="rental-ask-composer"]:visible #rental-ask-input').first();
        const send = page.locator('[data-testid="rental-ask-composer"]:visible [data-testid="rental-ask-send"]').first();
        const cards = page.locator('[data-testid="rentals-grid"] [data-result-kind="rental"][data-testid^="rental-card-"]');
        const ask = async (query: string) => {
          await expect(input).toBeVisible({ timeout: 40_000 });
          await input.fill(query);
          await expect(send).toBeEnabled({ timeout: 45_000 });
          await send.click();
          await expect(input).toBeEmpty({ timeout: 20_000 });
        };

        await ask("Show apartments in Laureles.");
        await expect.poll(() => cards.count(), { timeout: 120_000 }).toBeGreaterThanOrEqual(3);
        const initialCount = await cards.count();
        const table = page.getByRole("table", { name: /side-by-side apartment comparison/i });
        const queryCounts: number[] = [];
        page.on("response", (r) => {
          if (new URL(r.url()).pathname === "/api/rentals/search" && r.request().method() === "POST") {
            queryCounts.push(r.status());
          }
        });

        await ask("Put the first two apartments in a table.");
        await expect(table).toBeVisible({ timeout: 120_000 });
        await expect(page.getByText("Compare 2 apartments", { exact: true })).toBeVisible();
        await expect(page.getByText("Recorded details", { exact: true })).toBeVisible();
        await expect(page.getByText(/Prices are listing rates, not confirmed availability/)).toBeVisible();
        await expect(table.locator("thead th")).toHaveCount(3);
        await expect(table.getByRole("row").filter({ hasText: "Monthly rent" })).toBeVisible();
        await expect(table.getByRole("row").filter({ hasText: "Nightly rent" })).toBeVisible();
        await expect(table.getByRole("row").filter({ hasText: "Wi-Fi speed" })).toBeVisible();
        await expect(page.locator(".a2ui-std-table-wrap")).toBeVisible();
        await expect(page.getByTestId("rental-comparison-actions")).toBeVisible();
        await expect(page.locator("[data-streamdown] table")).toHaveCount(0);
        expect(queryCounts, "comparison reuses current results rather than searching").toEqual([]);
        expect(await cards.count()).toBe(initialCount);

        const action = page.getByTestId("rental-comparison-actions").getByRole("button", { name: "Details" }).first();
        await action.focus();
        await expect(action).toBeFocused();
        // Keyboard Enter uses the existing Rental Details flow, not a fake
        // A2UI-only detail modal or a new network-backed comparison action.
        await action.press("Enter");
        const details = page.getByTestId(width === 390 ? "rental-details-sheet" : "rental-details-panel");
        await expect(details).toBeVisible({ timeout: 20_000 });
        await page.getByTestId("rental-details-close").click();
        await expect(details).not.toBeVisible();

        // Only persisted, requestable listing actions are offered. Opening
        // the existing review form is read-only: never submit a QA viewing.
        const viewing = page.getByTestId("rental-comparison-actions")
          .getByRole("button", { name: "Schedule viewing" }).first();
        if (await viewing.count()) {
          await viewing.click();
          const proposal = page.getByTestId("schedule-viewing-modal");
          await expect(proposal).toBeVisible({ timeout: 20_000 });
          await page.keyboard.press("Escape");
          await expect(proposal).not.toBeVisible();
        }

        await ask("Compare the second and third apartments side by side.");
        await expect(table).toBeVisible({ timeout: 120_000 });
        await expect(table.locator("thead th")).toHaveCount(3);
        await expect(table).toHaveCount(1);
        expect(queryCounts).toEqual([]);
        expect(await cards.count()).toBe(initialCount);

        if (width === 390) {
          // Read-only DOM stress test on the genuine rendered CopilotKit table.
          // Does NOT insert fake listings or change Supabase or the model output.
          const stress = await table.evaluate((element) => {
            const header = element.querySelectorAll("thead th")[1];
            const amountRow = Array.from(element.querySelectorAll("tbody tr"))
              .find((row) => row.textContent?.includes("Monthly rent"));
            const amountCell = amountRow?.querySelectorAll("td")[1];
            if (!header || !amountCell) return false;
            header.textContent =
              "Very long furnished apartment title with balcony and dedicated remote-work office near transit";
            amountCell.textContent = "COP 9,876,543,210,123 (listed monthly)";
            return true;
          });
          expect(stress, "real Table has header and monthly amount cells to stress").toBe(true);
          await expect(table.getByText("Very long furnished apartment title with balcony and dedicated remote-work office near transit")).toBeAttached();
          const layout = await page.evaluate(() => {
            const wrapper = document.querySelector(".a2ui-std-table-wrap");
            return {
              screenWidth: document.documentElement.scrollWidth,
              windowWidth: window.innerWidth,
              tableScrollerWidth: wrapper?.clientWidth ?? 0,
              overflowingTable: (wrapper?.scrollWidth ?? 0) > (wrapper?.clientWidth ?? 0),
            };
          });
          expect(layout.screenWidth).toBeLessThanOrEqual(layout.windowWidth + 2);
          expect(layout.tableScrollerWidth).toBeLessThanOrEqual(390);
          expect(layout.overflowingTable, "comparison scrolls inside its container").toBe(true);
          const scroll = await page.locator(".a2ui-std-table-wrap").evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
            return { left: element.scrollLeft, full: element.scrollWidth, viewport: element.clientWidth };
          });
          expect(scroll.full).toBeGreaterThan(scroll.viewport);
          expect(scroll.left, "long apartment name and amount are reachable by horizontal scroll").toBeGreaterThan(0);
        }
      });
  }
});
