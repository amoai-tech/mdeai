import { test, expect } from "@playwright/test";
import { hasE2eEnv, signInAsOnOrigin, QA_HOST_EMAIL } from "./helpers/auth";

/**
 * SAN-1314 — live signed-in route proof against a deployed environment.
 *
 * The deterministic middleware suite already proves the guard logic, but it does
 * not prove that a *real production session cookie* survives the Next.js proxy
 * and that a protected route actually renders for an authenticated user.
 *
 * This spec mints a genuine Supabase session for the dedicated QA account
 * (`qa-landlord@mdeai.co`) through the admin API and injects it as the
 * `sb-<ref>-auth-token` cookie for the target origin. It deliberately does NOT
 * use `E2E_BYPASS_AUTH`, so production authentication is never weakened.
 *
 * Runs only when PROD_SMOKE_BASE_URL is set and the Supabase e2e env is present
 * (NEXT_PUBLIC_SUPABASE_URL + public key + SUPABASE_SERVICE_ROLE_KEY).
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const enabled = Boolean(baseUrl) && hasE2eEnv();

test.describe("prod signed-in route proof", () => {
  test.skip(
    !enabled,
    "Set PROD_SMOKE_BASE_URL and Supabase e2e env (url + public key + service role key)",
  );

  test("signed-out /saved redirects to /login carrying next", async ({ page }) => {
    await page.goto(`${baseUrl}/saved`, { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/login");
    expect(page.url()).toContain("next=");
    expect(page.url()).toContain(encodeURIComponent("/saved"));
  });

  test(`signed-in ${QA_HOST_EMAIL} reaches /saved with 200 and no login redirect`, async ({
    page,
  }) => {
    await signInAsOnOrigin(page, baseUrl);

    const response = await page.goto(`${baseUrl}/saved`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });
});
