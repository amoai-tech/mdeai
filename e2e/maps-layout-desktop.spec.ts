import { test, expect } from "@playwright/test";
import {
  collectCriticalConsoleErrors,
  gotoHome,
} from "./helpers/maps-layout";

test.describe("MAP-007B desktop layout", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("nav left, center chat, map right at 1280px", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await gotoHome(page);

    await expect(page.locator('[data-testid="nav-rail"]:visible')).toHaveCount(1);
    await expect(page.locator('[data-testid="center-chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="copilot-chat-region"]')).toBeVisible();
    await expect(page.locator(".copilotKitChat")).toBeVisible();
    await expect(page.locator('[data-testid="map-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-map"]')).toBeVisible();
    await expect(page.locator(".copilotKitSidebar")).toHaveCount(0);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    expect(overflow).toBe(false);

    expect(collectCriticalConsoleErrors(errors)).toEqual([]);
  });
});

test.describe("MAP-007B desktop 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("three regions at 1440px", async ({ page }) => {
    await gotoHome(page);
    await expect(page.locator('[data-testid="nav-rail"]:visible')).toHaveCount(1);
    await expect(page.locator('[data-testid="center-chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-map"]')).toBeVisible();
  });
});
