import { test, expect } from "@playwright/test";
import { hasE2eEnv, signInAsOnOrigin } from "./helpers/auth";

// Authenticated QA pages must never save session-bearing traces or screenshots.
test.use({ screenshot: "off", trace: "off", video: "off" });

test.describe("SAN-1610 · Homepage account navigation", { tag: ["@auth", "@smoke"] }, () => {
  for (const width of [320, 390, 768, 1280, 1440]) {
    test(`guest can click Login and Sign up from the ${width}px homepage`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 844 });

      await page.goto("/");
      const header = page.getByRole("banner");
      const login = header.getByRole("link", { name: "Log in", exact: true });
      const signup = header.getByRole("link", { name: "Sign up", exact: true });

      await expect(login).toBeVisible();
      await expect(signup).toBeVisible();
      await expect(login).toHaveAttribute("href", "/login");
      await expect(signup).toHaveAttribute("href", "/signup");

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "Homepage must not overflow horizontally").toBeLessThanOrEqual(1);

      for (const link of [login, signup]) {
        const box = await link.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
      }

      if (width < 1024) {
        const menuButton = header.getByRole("button", { name: "Open menu" });
        const buttonBounds = await menuButton.boundingBox();
        expect(buttonBounds, "Mobile menu must have a visible hit target").not.toBeNull();
        expect(buttonBounds!.x).toBeGreaterThanOrEqual(0);
        expect(buttonBounds!.x + buttonBounds!.width).toBeLessThanOrEqual(width);
        expect(buttonBounds!.width).toBeGreaterThanOrEqual(44);
        expect(buttonBounds!.height).toBeGreaterThanOrEqual(44);
        await menuButton.click();
        const menu = page.getByRole("navigation", { name: "Mobile site verticals" });
        await expect(menu.getByRole("link", { name: "Saved" })).toBeVisible();
        await expect(menu.getByRole("link", { name: "Host an event" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
      } else {
        await expect(header.getByRole("link", { name: "Saved" })).toBeVisible();
        await expect(header.getByRole("link", { name: "Host" })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Site verticals" })).toBeVisible();
      }

      if (width === 390 || width === 1440) {
        await header.screenshot({ path: `tmp/san-1610-header-${width}.png` });
      }

      await login.click();
      await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Email magic link" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

      await page.goto("/");
      const signupAgain = page.getByRole("banner").getByRole("link", { name: "Sign up", exact: true });
      await expect(signupAgain).toBeVisible();
      await signupAgain.click();
      await expect(page).toHaveURL(/\/signup$/, { timeout: 20_000 });
      await expect(page.getByText("Create account", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Email magic link" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    });
  }

  test.describe("real Supabase session", () => {
    // Use a real existing QA identity. Scope its session cookie to the tested origin,
    // not the localhost-only authenticatedPage fixture.
    test.skip(!hasE2eEnv(), "Needs existing Supabase QA identity and service key in ignored local env");

    for (const width of [390, 1440]) {
      test(`signed-in account link opens /app at ${width}px`, async ({ page, baseURL }) => {
        if (!baseURL) throw new Error("Signed-in header QA needs a configured baseURL");
        await signInAsOnOrigin(page, baseURL);
        await page.setViewportSize({ width, height: 844 });
        await page.goto("/");
        const header = page.getByRole("banner");
        const account = header.getByRole("link", { name: "My account" });
        await expect(account).toBeVisible();
        await expect(header.getByRole("link", { name: "Log in", exact: true })).toHaveCount(0);
        await expect(header.getByRole("link", { name: "Sign up", exact: true })).toHaveCount(0);
        await account.click();
        await expect(page).toHaveURL(/\/app(?:[?#]|$)/, { timeout: 20_000 });
      });
    }
  });
});
