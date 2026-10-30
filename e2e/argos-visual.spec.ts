import { expect, test } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";

// Deterministic, read-only public pages: no authentication, payments, or live DB writes.
// Keep screenshot names stable: Argos matches them across commits.
test("login page — desktop (1440px)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  await expect(page.locator("#main-content")).toBeVisible();
  await argosScreenshot(page, "login-desktop-1440");
});

test("login page — mobile (390px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  await expect(page.locator("#main-content")).toBeVisible();
  await argosScreenshot(page, "login-mobile-390");
});

test("signup page — mobile (390px)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/signup");
  expect(response?.status()).toBe(200);
  await expect(page.locator("main")).toBeVisible();
  await argosScreenshot(page, "signup-mobile-390");
});
