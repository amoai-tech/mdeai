import { test, expect } from "@playwright/test";
import { getSupabaseAdmin, hasE2eEnv, loadEnvLocalForE2E } from "./helpers/auth";

loadEnvLocalForE2E();
// Local OS Chrome fallback; CI uses its pinned Playwright browser by default.
test.use({ launchOptions: process.env.MDE_E2E_CHROME_PATH
  ? { executablePath: process.env.MDE_E2E_CHROME_PATH } : {} });

test.describe("SAN-1469 canonical restaurant detail", () => {
  test.skip(!hasE2eEnv(), "Needs real Supabase E2E configuration");

  test("opens a real restaurant and fits mobile", async ({ page }) => {
    const admin = await getSupabaseAdmin();
    const { data, error } = await admin.from("restaurants").select("id,name").eq("is_active", true).order("name").limit(1);
    expect(error).toBeNull();
    const restaurant = data?.[0];
    expect(restaurant).toBeTruthy();
    await page.goto("/restaurants/" + restaurant!.id);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(restaurant!.name);
    await expect(page.getByTestId("vote-not-open").or(page.getByTestId("vote-cta"))).toBeVisible();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test("shows Not Found for an unknown restaurant", async ({ page }) => {
    await page.goto("/restaurants/00000000-0000-0000-0000-000000000000");
    await expect(page.getByRole("heading", { name: "404", level: 1 })).toBeVisible();
  });
});
