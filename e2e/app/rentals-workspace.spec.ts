import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";

test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});

/**
 * SAN-1578 — the /app rentals adapter reuses the existing concierge and
 * listings page bodies with an /app route family. A landlord fixture is the
 * smallest identity the broker gate accepts.
 */
test.describe("SAN-1578 /app rentals", { tag: ["@app", "@rentals"] }, () => {
  // Cold dev compilation of both broker routes takes ~50s in CI shards.
  test.setTimeout(120_000);
  test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

  test("landlord opens the concierge and listings under /app", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const identity = await createThrowawayIdentity("san1578-landlord");
    const admin = await getSupabaseAdmin();

    try {
      // A signed-in newcomer can complete setup entirely within the /app route.
      await signInAsOnOrigin(page, origin, identity.email);
      await page.goto("/app/rentals");
      await expect(page).toHaveURL(/\/app\/rentals\/onboarding$/);
      await expect(page.getByTestId("rentals-onboarding")).toBeVisible();
      await expect(page.getByTestId("ro-ack")).toHaveCount(0);

      const landlord = await admin.from("landlord_profiles").insert({
        user_id: identity.userId,
        display_name: "SAN-1578 QA Landlord",
      });
      expect(landlord.error, landlord.error?.message).toBeNull();

      await signInAsOnOrigin(page, origin, identity.email);

      await page.goto("/app");
      const rentalsCard = page.getByTestId("workspace-card-rentals");
      await expect(rentalsCard).toBeVisible();
      await expect(rentalsCard.getByRole("link", { name: "Open" })).toHaveAttribute(
        "href",
        "/app/rentals",
      );

      await page.goto("/app/rentals");
      await expect(page.getByTestId("rentals-concierge")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Your rentals, run by AI" }),
      ).toBeVisible();
      await expect(
        page.getByTestId("host-rentals-nav-listings"),
      ).toHaveAttribute("href", "/app/rentals/listings");

      await page.goto("/app/rentals/listings");
      await expect(page.getByTestId("rentals-listings")).toBeVisible();

      // Empty inventory renders the empty state without the domain nav, so
      // return through the route itself rather than a missing nav link.
      await page.goto("/app/rentals");
      await expect(page).toHaveURL(/\/app\/rentals$/);
      await expect(page.getByTestId("rentals-concierge")).toBeVisible();
    } finally {
      await admin
        .from("landlord_profiles")
        .delete()
        .eq("user_id", identity.userId);
      await deleteThrowawayIdentity(identity);
    }
  });
});
