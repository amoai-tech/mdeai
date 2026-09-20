import { test, expect } from "@playwright/test";
import {
  gotoHome,
  RENTAL_QUERY,
  sendConciergeMessage,
  waitForRentalCards,
} from "../helpers/maps-layout";
import {
  assertConsoleClean,
  captureScreenEvidence,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  watchCriticalConsoleErrors,
} from "../helpers/screen-evidence";

const SCREEN_ID = "SCREEN-008";
const MOCK_LEAD_ID = "11111111-1111-1111-1111-000000000001";
const MOCK_SHOWING_ID = "22222222-2222-2222-2222-000000000002";
// SAN-1203 — the modal now requires a future viewing time.
const FUTURE_LOCAL_TIME = "2099-06-01T15:00";
const ACK_MESSAGE = "Viewing request received — awaiting host confirmation.";

test.describe.configure({ mode: "serial" });

async function fillAndSubmitViewing(page: import("@playwright/test").Page) {
  const modal = page.locator('[data-testid="schedule-viewing-modal"]');
  await modal.locator('input[name="name"]').fill("Camila Test");
  await modal.locator('input[name="email"]').fill("camila.test@mdeai.co");
  await modal.locator('input[name="preferredAt"]').fill(FUTURE_LOCAL_TIME);
  await page.locator('[data-testid="schedule-viewing-submit"]').click();
}

test.describe(`${SCREEN_ID} schedule viewing modal`, () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/leads/schedule-viewing", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          leadId: MOCK_LEAD_ID,
          showingId: MOCK_SHOWING_ID,
          message: ACK_MESSAGE,
        }),
      });
    });
  });

  test.describe("desktop", () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test("submit shows confirmation card in chat chrome", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await gotoHome(page);
      await sendConciergeMessage(page, RENTAL_QUERY);
      await waitForRentalCards(page);

      await page.locator('[data-testid="rental-schedule-cta"]').first().click();
      await expect(page.locator('[data-testid="schedule-viewing-modal"]')).toBeVisible();

      await fillAndSubmitViewing(page);

      const card = page.locator('[data-testid="lead-confirmation-card"]');
      await expect(card).toBeVisible();
      await expect(page.locator('[data-testid="schedule-viewing-modal"]')).toHaveCount(0);
      // SAN-1203 — truthful copy, and the committed showing id is carried through.
      await expect(card).toContainText("Viewing request received");
      await expect(card).toContainText("awaiting host confirmation");
      await expect(card).toHaveAttribute("data-showing-id", MOCK_SHOWING_ID);

      await captureScreenEvidence(page, SCREEN_ID, "desktop-lead-confirmation.png");
      assertConsoleClean(errors);
    });

    // SAN-1203 — permanent gate: a lead-only commit must never look successful.
    test("lead-only commit does not close the modal as success", async ({ page }) => {
      await page.route("**/api/leads/schedule-viewing", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            leadId: MOCK_LEAD_ID,
            message: "Viewing scheduled",
          }),
        });
      });

      await gotoHome(page);
      await sendConciergeMessage(page, RENTAL_QUERY);
      await waitForRentalCards(page);

      await page.locator('[data-testid="rental-schedule-cta"]').first().click();
      await fillAndSubmitViewing(page);

      await expect(page.locator('[data-testid="lead-confirmation-card"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="schedule-viewing-modal"]')).toBeVisible();
    });
  });

  test.describe("mobile", () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test("venue sheet schedule path submits", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await gotoHome(page);
      await sendConciergeMessage(page, RENTAL_QUERY);
      await waitForRentalCards(page);

      await page.locator('[data-testid="rental-details-cta"]').first().click();
      await page.locator('[data-testid="venue-detail-schedule-cta"]').click();

      await fillAndSubmitViewing(page);

      await expect(page.locator('[data-testid="lead-confirmation-card"]')).toBeVisible();
      await captureScreenEvidence(page, SCREEN_ID, "mobile-lead-confirmation.png");
      assertConsoleClean(errors);
    });
  });
});
