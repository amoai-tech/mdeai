import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";

test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});

/**
 * SAN-1577 review fix: a signed-in person with no events must still reach the
 * real Events creation workspace. Visibility is navigation; private reads stay
 * organizer-scoped and RLS-protected.
 */
test.describe("SAN-1577 first-time organizer", { tag: ["@app", "@events"] }, () => {
  test.setTimeout(180_000);
  test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

  test("opens Events and the wizard before owning any event", async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const identity = await createThrowawayIdentity("san1577-first");
    try {
      await signInAsOnOrigin(page, origin, identity.email);
      await page.goto("/app", { waitUntil: "domcontentloaded" });

      const card = page.getByTestId("workspace-card-events");
      await expect(card).toBeVisible({ timeout: 45_000 });
      await expect(card.getByRole("link", { name: /Open/ })).toHaveAttribute(
        "href",
        "/app/events",
      );
      await card.getByRole("link", { name: /Open/ }).click();
      await expect(page).toHaveURL(/\/app\/events$/, { timeout: 45_000 });
      await expect(page.getByTestId("host-events-empty")).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);

      await page.getByTestId("host-events-create-cta").click();
      await expect(page).toHaveURL(/\/app\/events\/new$/, { timeout: 45_000 });
      await expect(page.getByTestId("host-event-wizard")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.locator("main")).toHaveCount(1);
    } finally {
      await deleteThrowawayIdentity(identity);
    }
  });
});
