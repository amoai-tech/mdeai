import { test, expect } from "@playwright/test";
import {
  captureScreenEvidence,
  watchCriticalConsoleErrors,
  assertConsoleClean,
  DESKTOP_VIEWPORT,
} from "../helpers/screen-evidence";
import { gotoHome } from "../helpers/maps-layout";

const SCREEN_ID = "SCREEN-002";

test.describe.configure({ mode: "serial" });

test.describe(`${SCREEN_ID} chat nav rail`, () => {
  test.describe("desktop", () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test("nav rail renders with required regions", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await gotoHome(page);

      await expect(page.locator('[data-testid="nav-rail"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-new-chat"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-saved-link"]')).toBeAttached();
      await expect(page.locator('[data-testid="nav-trips-link"]')).toBeAttached();

      await captureScreenEvidence(page, SCREEN_ID, "nav-rail-desktop.png");
      assertConsoleClean(errors);
    });

    test("thread list resolves from loading state", async ({ page }) => {
      await gotoHome(page);
      await expect(page.locator('[data-testid="nav-rail"]')).toBeVisible();

      // Wait for skeleton to be removed from DOM (avoids .not.toBeVisible race)
      await page.waitForFunction(
        () => document.querySelector('[data-testid="nav-rail"] .animate-pulse') === null,
        { timeout: 5000 },
      );

      // Either thread items or the empty/error state must be present
      const threadCount = await page.locator('[data-testid="nav-thread-item"]').count();
      const emptyState = page.locator('[data-testid="nav-threads-empty"]');
      if (threadCount === 0) {
        await expect(emptyState).toBeVisible();
      } else {
        await expect(page.locator('[data-testid="nav-thread-item"]').first()).toBeVisible();
      }
    });

    test("new chat clears active thread and stays on home", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await gotoHome(page);

      const rail = page.locator('[data-testid="nav-rail"]');
      await expect(rail).toBeVisible();

      // Wait for thread list to settle
      await page.waitForFunction(
        () => document.querySelector('[data-testid="nav-rail"] .animate-pulse') === null,
        { timeout: 5000 },
      );

      // If threads are present, click the first to establish an active state
      const firstThread = page.locator('[data-testid="nav-thread-item"]').first();
      if ((await firstThread.count()) > 0) {
        await firstThread.click();
        await expect(rail).toHaveAttribute("data-active-thread-id", /.+/);
      }

      await page.locator('[data-testid="nav-new-chat"]').click();

      // Stays on the concierge (/chat since D-13); it used to assert "/", which
      // was the SAN-1378 defect of dropping Sofia on the marketing home.
      await expect(page).toHaveURL(/\/chat$/);
      // Active thread is cleared — attribute present but empty
      await expect(rail).toHaveAttribute("data-active-thread-id", "");
      // Chat region is still usable
      await expect(page.locator('[data-testid="copilot-chat-region"]')).toBeVisible();
      assertConsoleClean(errors);
    });

    test("saved and trips are live links", async ({ page }) => {
      await gotoHome(page);
      for (const [slug, href] of [
        ["saved", "/saved"],
        ["trips", "/trips"],
      ] as const) {
        const link = page.locator(`[data-testid="nav-${slug}-link"]`);
        await expect(link).toBeAttached();
        await expect(link).not.toHaveAttribute("aria-disabled", /.*/);
        await expect(link).toHaveAttribute("href", href);
      }
    });

    test("sidebar links navigate without reloading the page", async ({ page }) => {
      await gotoHome(page);
      // A value set on `window` survives client-side navigation and is lost on a document reload.
      await page.evaluate(() => {
        (window as unknown as { __navSentinel?: boolean }).__navSentinel = true;
      });
      await page.locator('[data-testid="nav-saved-link"]').click();
      await expect(page).toHaveURL(/\/saved/);
      const survived = await page.evaluate(
        () => (window as unknown as { __navSentinel?: boolean }).__navSentinel === true,
      );
      expect(survived, "the page was reloaded instead of navigated client-side").toBe(true);
    });

    test("a chat without a title shows a dated name, never the word null", async ({ page }) => {
      await page.route("**/api/threads", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            threads: [
              { id: "t-untitled", title: null, updatedAt: "2026-10-02T21:32:00.000Z" },
              { id: "t-titled", title: "Apartment search in Laureles", updatedAt: "2026-10-02T20:00:00.000Z" },
            ],
          }),
        }),
      );
      await gotoHome(page);
      const items = page.locator('[data-testid="nav-thread-item"]');
      await expect(items).toHaveCount(2);
      await expect(items.nth(0)).toHaveText(/^Chat · Oct \d{1,2}, /);
      await expect(items.nth(0)).not.toHaveText(/null/i);
      await expect(items.nth(1)).toHaveText("Apartment search in Laureles");
    });

    test("unauthenticated session shows empty thread state", async ({ page, context }) => {
      await context.clearCookies();
      await gotoHome(page);

      // Wait for skeleton to clear before asserting final state
      await page.waitForFunction(
        () => document.querySelector('[data-testid="nav-rail"] .animate-pulse') === null,
        { timeout: 5000 },
      );

      // Unauthenticated → /api/threads returns [] → "No chats yet"
      await expect(page.locator('[data-testid="nav-threads-empty"]')).toBeVisible();
    });
  });
});
