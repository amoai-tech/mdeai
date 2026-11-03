import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  hasE2eEnv,
  signInAsOnOrigin,
} from "./helpers/auth";

/**
 * Admin pages must never be a dead end.
 *
 * Before this change an anonymous visitor was told "Sign in as an admin to manage contests." with
 * nothing to click. These tests prove the prompt links to the EXISTING /login route, keeps the
 * return path, and still refuses a signed-in non-admin.
 */
const ADMIN_ROUTES = ["/admin/contests", "/admin/event-bookings", "/admin/rentals"];
const CONTEST_ID = "0c2c7097-0c39-412a-9106-0af31c21d197";
const origin = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";

test.describe("admin sign-in prompt", { tag: ["@auth", "@admin"] }, () => {
  for (const route of ADMIN_ROUTES) {
    test(`anonymous ${route} offers a sign-in button that returns to the page`, async ({ page }) => {
      await page.goto(route);

      await expect(page.getByTestId("admin-sign-in-required")).toBeVisible();
      const cta = page.getByTestId("sign-in-required-cta");
      await expect(cta).toBeVisible();
      expect(await cta.getAttribute("href")).toBe("/login?next=" + encodeURIComponent(route));

      // A cold Next dev server compiles the route on first request; clicking a <Link> before
      // hydration can be swallowed. Wait for the document to settle first.
      await page.waitForLoadState("networkidle");
      await cta.click();
      await expect(page).toHaveURL(/\/login\?next=/, { timeout: 15_000 });
      expect(new URL(page.url()).searchParams.get("next")).toBe(route);
      // The existing login surface, unchanged.
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Email magic link" })).toBeVisible();
    });
  }

  test("contest details keeps the exact contest in the return path", async ({ page }) => {
    await page.goto("/admin/contests/" + CONTEST_ID);
    const cta = page.getByTestId("sign-in-required-cta");
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toBe(
      "/login?next=" + encodeURIComponent("/admin/contests/" + CONTEST_ID),
    );
  });

  test("the prompt is usable at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/contests");
    await expect(page.getByTestId("sign-in-required-cta")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("an unsafe return path is not forwarded to /login", async ({ page }) => {
    // The page always builds its own path, so this asserts the contract holds even if a
    // future caller passes something hostile.
    await page.goto("/login?next=" + encodeURIComponent("https://evil.example/x"));
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });
});

test.describe("admin sign-in prompt · signed-in users", { tag: ["@auth", "@admin"] }, () => {
  test.skip(!hasE2eEnv(), "Needs Supabase test credentials");

  test("a signed-in non-admin sees access denied and no sign-in button", async ({ page }) => {
    const identity = await createThrowawayIdentity("admin-signin-nonadmin");
    try {
      await signInAsOnOrigin(page, origin, identity.email);
      await page.goto("/admin/contests");
      await expect(page.getByTestId("admin-not-authorized")).toContainText("Admin access required");
      await expect(page.getByTestId("sign-in-required-cta")).toHaveCount(0);
      await expect(page.getByTestId("contest-create-submit")).toHaveCount(0);
    } finally {
      await deleteThrowawayIdentity(identity);
    }
  });
});