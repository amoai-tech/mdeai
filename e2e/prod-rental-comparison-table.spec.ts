import { test, expect } from "./fixtures";
import { getTestSession } from "./helpers/auth";
import { resolveQaRoleEmail } from "./helpers/qa-roles";
import { asUser } from "./helpers/rental-journey-fixture";

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
        const mobileFilters = page.getByTestId("rentals-mobile-filters-trigger");
        if (width === 390) {
          await expect(mobileFilters).toBeVisible();
          await expect(page.getByRole("group", { name: "Neighborhood filters" })).toHaveCount(0);
          expect((await mobileFilters.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          await mobileFilters.click();
          const filterSheet = page.getByTestId("rentals-mobile-filter-sheet");
          await expect(filterSheet).toBeVisible();
          await expect(filterSheet.getByRole("group", { name: "Neighborhood filters" })).toBeVisible();
          await expect(filterSheet.getByRole("group", { name: "Bedroom filters" })).toBeVisible();
          await expect(filterSheet.getByTestId("rentals-dates-trigger")).toBeVisible();
          await filterSheet.getByRole("button", { name: "Show apartments" }).click();
          await expect(filterSheet).toBeHidden();
          await page.getByTestId("workspace-mobile-profile").click();
          const profile = page.getByRole("dialog", { name: "Profile" });
          await expect(profile).toBeVisible();
          await expect(profile.getByRole("button", { name: "Sign out" })).toBeVisible();
          await profile.getByRole("button", { name: "Close" }).click();
          await expect(profile).toBeHidden();
        } else {
          await expect(mobileFilters).toHaveCount(0);
          await expect(page.getByRole("group", { name: "Neighborhood filters" })).toBeVisible();
        }

        const input = page.locator('[data-testid="rental-ask-composer"]:visible #rental-ask-input').first();
        const send = page.locator('[data-testid="rental-ask-composer"]:visible [data-testid="rental-ask-send"]').first();
        const cards = page.locator('[data-testid="rentals-grid"] [data-result-kind="rental"][data-testid^="rental-card-"]');
        const ask = async (query: string) => {
          await expect(input).toBeVisible({ timeout: 40_000 });
          await input.fill(query);
          await expect(send).toBeEnabled({ timeout: 45_000 });
          await send.click();
          await expect(input).toBeEmpty({ timeout: 20_000 });
          // A cleared composer is not a completed AI turn: the Send button
          // returns only after the real run/stream has finished.
          await expect(send).toBeVisible({ timeout: 120_000 });
        };

        await ask("Show apartments in Laureles.");
        await expect.poll(() => cards.count(), { timeout: 120_000 }).toBeGreaterThanOrEqual(3);
        const initialCount = await cards.count();
        if (width === 390) {
          const header = page.getByTestId("workspace-header");
          await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
          await expect(header).toHaveAttribute("data-scroll-hidden", "false");
          await page.evaluate(() => window.scrollTo(0, 400));
          await expect(header).toHaveAttribute("data-scroll-hidden", "true");
          await expect.poll(async () => (await header.boundingBox())!.y + (await header.boundingBox())!.height).toBeLessThanOrEqual(1);
          const map = page.getByTestId("browse-map-fab");
          const composer = page.getByTestId("workspace-ask-composer");
          await expect(map).toBeInViewport();
          await expect(composer).toBeInViewport();
          expect((await map.boundingBox())!.height).toBeGreaterThanOrEqual(44);
          expect((await map.boundingBox())!.y + (await map.boundingBox())!.height).toBeLessThanOrEqual((await composer.boundingBox())!.y + 1);
          await page.evaluate(() => window.scrollTo(0, 120));
          await expect(header).toHaveAttribute("data-scroll-hidden", "false");
          await expect.poll(async () => (await header.boundingBox())!.y).toBeGreaterThanOrEqual(-1);
        }
        // Card identities come from the real authorized rental search.
        // Use them to prove that the next comparison selects *different*
        // apartments rather than merely keeping the old Table visible.
        const cardIds = await cards.evaluateAll((elements) =>
          elements.slice(0, 3).map((element) =>
            (element.getAttribute("data-testid") ?? "").replace(/^rental-card-/, "")
          )
        );
        expect(cardIds).toHaveLength(3);
        expect(cardIds.every(Boolean)).toBe(true);

        // Use the existing renter QA identity, not a service-role data reader.
        // Supabase RLS is applied to this client exactly as for a renter.
        const renterEmail = resolveQaRoleEmail("renter");
        expect(renterEmail, "dedicated renter QA identity is configured").toBeTruthy();
        const renter = asUser(await getTestSession(renterEmail!, { requireExisting: true }));
        const { data: authorized, error: readError } = await renter.from("apartments")
          .select("id,title,neighborhood,bedrooms,furnished,price_monthly,price_daily,currency,wifi_speed")
          .in("id", cardIds);
        expect(readError, "renter-scoped Supabase readback").toBeNull();
        expect(authorized).toHaveLength(3);
        const byId = new Map((authorized ?? []).map((record) => [String(record.id), record]));
        const records = cardIds.map((id) => byId.get(id));
        expect(records.every(Boolean)).toBe(true);
        const comparisonSurface = page.getByTestId("rental-comparison-surface");
        const table = comparisonSurface.getByRole("table", { name: /side-by-side apartment comparison/i });
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



        await expect(page.locator(".a2ui-std-table-wrap")).toBeVisible();
        if (width === 390) {
          const feature = table.locator("tbody tr").first().locator("td").first();
          await expect(feature).toHaveCSS("position", "sticky");
          await expect(feature).toHaveCSS("left", "0px");
        }
        // Official Standard Buttons are rendered from the authorized result,
        // not custom React wrappers with listing IDs copied into DOM attributes.
        await expect(comparisonSurface.getByRole("button", { name: "Details" })).toHaveCount(2);
        await expect(comparisonSurface.getByRole("button", { name: "Schedule viewing" })).toHaveCount(2);
        // Compare identities and recorded facts with renter-visible database rows.
        const featureCell = (label: string, index: number) =>
          table.locator("tbody tr").filter({ hasText: label }).first().locator("td").nth(index + 1);
        for (const index of [0, 1]) {
          const record = records[index]!;
          await expect(table.locator("thead th").nth(index + 1)).toHaveText("Option #" + (index + 1) + " " + record.title);
          if (records.slice(0, 2).some((r) => r?.neighborhood)) await expect(featureCell("Neighborhood", index)).toHaveText(record.neighborhood || "Not recorded");
          if (records.slice(0, 2).some((r) => r?.bedrooms != null)) await expect(featureCell("Bedrooms", index)).toHaveText(
            record.bedrooms == null ? "Not recorded" : String(record.bedrooms));
          if (records.slice(0, 2).some((r) => r?.furnished != null)) await expect(featureCell("Furnished", index)).toHaveText(
            record.furnished == null ? "Not recorded" : record.furnished ? "Yes" : "No");
          for (const [label, amount] of [
            ["Monthly rent", record.price_monthly], ["Nightly rent", record.price_daily],
          ] as const) {
            const hasRecordedPrice = records.slice(0, 2).some((r) => Number(label === "Monthly rent" ? r?.price_monthly : r?.price_daily) > 0);
            if (!hasRecordedPrice) {
              await expect(table.getByRole("row").filter({ hasText: label })).toHaveCount(0);
              continue;
            }
            const displayed = (await featureCell(label, index).innerText()).trim();
            if (amount == null || Number(amount) <= 0) expect(displayed).toBe("Not recorded");
            else {
              expect(Number(displayed.replace(/[^\d.]/g, ""))).toBe(Number(amount));
              if (record.currency) expect(displayed).toContain(record.currency);
            }
          }
        }
        const missing = records.slice(0, 2).flatMap((record, index) => [
          { label: "Wi-Fi speed", value: record!.wifi_speed, index },
          { label: "Neighborhood", value: record!.neighborhood, index },
          { label: "Furnished", value: record!.furnished, index },
        ]).find(({ value }) => value == null);
        if (missing && await featureCell(missing.label, missing.index).count()) await expect(featureCell(missing.label, missing.index)).toHaveText("Not recorded");
        await expect(page.locator("[data-streamdown] table")).toHaveCount(0);
        expect(queryCounts, "comparison reuses current results rather than searching").toEqual([]);
        expect(await cards.count()).toBe(initialCount - 2);
        await expect(page.getByTestId("rental-other-results")).not.toHaveAttribute("open", "");

        const options = page.getByTestId("rental-compared-options");
        const askSelect = options.locator("[data-listing-id]").first().getByTestId("rental-ask-select");
        await expect(askSelect).toHaveAttribute("aria-pressed", "false");
        await askSelect.click();
        await expect(askSelect).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByTestId("rental-ask-clear-selection")).toBeVisible();
        await askSelect.click();
        await expect(askSelect).toHaveAttribute("aria-pressed", "false");
        await expect(page.getByTestId("rental-ask-clear-selection")).toHaveCount(0);

        const action = comparisonSurface.getByRole("button", { name: "Details" }).first();
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
        const viewing = comparisonSurface.getByRole("button", { name: "Schedule viewing" }).first();
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
        await expect(comparisonSurface.getByRole("button", { name: "Details" })).toHaveCount(2);
        await expect(comparisonSurface.getByRole("button", { name: "Schedule viewing" })).toHaveCount(2);
        await expect(table.locator("thead th").nth(1)).toHaveText("Option #1 " + records[1]!.title);
        await expect(table.locator("thead th").nth(2)).toHaveText("Option #2 " + records[2]!.title);
        await expect(table).toHaveCount(1);
        expect(queryCounts).toEqual([]);
        expect(await cards.count()).toBe(initialCount - 2);
        await expect(page.getByTestId("rental-other-results")).not.toHaveAttribute("open", "");

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

  // SAN-1694 prod receipt (23 Nov 2026): one message that searches AND compares
  // produced a table of apartments that were no longer on screen. Start from a
  // different visible set so a stale browser list would pick other apartments.
  for (const width of [1440, 390] as const) {
    test(`${width}px: search and compare in one message uses the newly shown cards`, async ({ qaRolePage: page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      expect((await page.goto("/rentals", { waitUntil: "domcontentloaded" }))?.ok()).toBe(true);
      const input = page.locator('[data-testid="rental-ask-composer"]:visible #rental-ask-input').first();
      const send = page.locator('[data-testid="rental-ask-composer"]:visible [data-testid="rental-ask-send"]').first();
      const cards = page.locator('[data-testid="rentals-grid"] [data-result-kind="rental"][data-testid^="rental-card-"]');
      // The canonical result order stays intact even when compared cards are
      // replaced by the single comparison section and other cards are collapsed.
      const firstIds = async () => (JSON.parse(
        (await page.getByTestId("rentals-grid").getAttribute("data-result-ids")) ?? "[]"
      ) as string[]).slice(0, 2);
      const ask = async (query: string) => {
        await expect(input).toBeVisible({ timeout: 40_000 });
        await input.fill(query);
        await expect(send).toBeEnabled({ timeout: 45_000 });
        await send.click();
        await expect(input).toBeEmpty({ timeout: 20_000 });
        await expect(send).toBeVisible({ timeout: 120_000 });
      };

      await ask("Show apartments in El Poblado.");
      await expect.poll(() => cards.count(), { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
      const before = await firstIds();

      await ask("Find 2BR apartments in Laureles and compare the first two.");
      const comparisonSurface = page.getByTestId("rental-comparison-surface");
      const table = comparisonSurface.getByRole("table", { name: /side-by-side apartment comparison/i });
      await expect(table).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId("rental-ask-transcript")).toHaveCount(0);
      await expect(page.getByTestId("rental-ask-toggle-transcript")).toHaveCount(0);
      // One current completed answer may accompany cards, never the old transcript.
      expect(await page.getByTestId("rental-ask-text-answer").count()).toBeLessThanOrEqual(1);
      await expect.poll(firstIds, { timeout: 30_000 }).not.toEqual(before);
      const shown = await firstIds();
      expect(shown.every(Boolean)).toBe(true);

      // Renter-scoped readback: the table columns are the first two cards now visible.
      const renter = asUser(await getTestSession(resolveQaRoleEmail("renter")!, { requireExisting: true }));
      const { data, error } = await renter.from("apartments").select("id,title,bedrooms,neighborhood").in("id", shown);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data?.every((row) => row.bedrooms === 2 && row.neighborhood?.toLowerCase().includes("laureles"))).toBe(true);
      const title = new Map((data ?? []).map((row) => [String(row.id), row.title]));
      await expect(table.locator("thead th")).toHaveCount(3);
      await expect(table.locator("thead th").nth(1)).toHaveText("Option #1 " + title.get(shown[0])!);
      await expect(table.locator("thead th").nth(2)).toHaveText("Option #2 " + title.get(shown[1])!);

      // The numbered comparison strip must use the same current authorized IDs
      // as the original Table and the cards, not the earlier El Poblado search.
      const options = page.getByTestId("rental-compared-options");
      await expect(options).toBeVisible();
      const optionCards = options.locator("[data-listing-id]");
      await expect(optionCards).toHaveCount(2);
      await expect(optionCards.nth(0)).toHaveAttribute("data-listing-id", shown[0]);
      await expect(optionCards.nth(1)).toHaveAttribute("data-listing-id", shown[1]);
      await expect(page.getByTestId("rental-card-" + shown[0])).toHaveCount(0);
      await expect(page.getByTestId("rental-card-" + shown[1])).toHaveCount(0);
      const other = page.getByTestId("rental-other-results");
      await expect(other).not.toHaveAttribute("open", "");
      const remaining = await cards.count();
      if (remaining > 0) {
        await expect(cards.first()).toBeHidden();
        await other.locator("summary").click();
        await expect(cards.first()).toBeVisible();
        await other.locator("summary").click();
        await expect(cards.first()).toBeHidden();
      }
      await expect(options.getByText(title.get(shown[0])!, { exact: true })).toBeVisible();
      await expect(options.getByText(title.get(shown[1])!, { exact: true })).toBeVisible();
      const firstMap = options.getByRole("button", { name: "Show compared apartment 1 on map" });
      if (await firstMap.count()) {
        await firstMap.click();
        await expect(optionCards.nth(0)).toHaveAttribute("data-selected", "true");
      }

      // The real official Button must open the Details UI for the first *new* card.
      // This also proves the server-side ID resolution is usable, not just display text.
      await comparisonSurface.getByRole("button", { name: "Details" }).first().click();
      const details = page.getByTestId(width === 390 ? "rental-details-sheet" : "rental-details-panel");
      await expect(details).toBeVisible({ timeout: 20_000 });
      await expect(details.getByText(title.get(shown[0])!, { exact: true }).first()).toBeVisible();
      await page.getByTestId("rental-details-close").click();
      await expect(details).not.toBeVisible();
      await comparisonSurface.getByRole("button", { name: "Details" }).nth(1).click();
      await expect(details).toBeVisible({ timeout: 20_000 });
      await expect(details.getByText(title.get(shown[1])!, { exact: true }).first()).toBeVisible();
      await page.getByTestId("rental-details-close").click();
      await expect(details).not.toBeVisible();
      if (width === 390) {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, "comparison must not cause page-level mobile overflow").toBeLessThanOrEqual(2);
      }
    });
  }
});
