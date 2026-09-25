import { test, expect } from "./fixtures/vercel-bypass";
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
 * Runs only when PROD_SMOKE_BASE_URL is set AND the Supabase e2e env is present.
 * When a target is configured but the credentials are not, the first test FAILS
 * loudly instead of the suite skipping to green — a skipped signed-in proof must
 * never be reported as a passed one.
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const enabled = Boolean(baseUrl);

/** Build an absolute URL without doubling slashes on a trailing-slash base. */
const route = (path: string) => new URL(path, `${baseUrl}/`).toString();

test.describe("prod signed-in route proof", () => {
  test.skip(!enabled, "Set PROD_SMOKE_BASE_URL (e.g. https://www.mdeai.co)");

  test("supplies the Supabase e2e credentials the signed-in proof needs", () => {
    // Guard against a silent skip: with a target configured but no credentials,
    // Playwright would report skipped tests and the workflow would look green.
    expect(
      hasE2eEnv(),
      "PROD_SMOKE_BASE_URL is set but NEXT_PUBLIC_SUPABASE_URL / public key / " +
        "SUPABASE_SERVICE_ROLE_KEY are missing, so the signed-in production proof " +
        "cannot run. Fix the workflow secrets; do not accept a skip as proof.",
    ).toBe(true);
  });

  test("signed-out /saved redirects to /login carrying next", async ({ page }) => {
    await page.goto(route("/saved"), { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/login");
    expect(page.url()).toContain("next=");
    expect(page.url()).toContain(encodeURIComponent("/saved"));
  });

  test(`signed-in ${QA_HOST_EMAIL} reaches /saved with 200 and no login redirect`, async ({
    page,
  }) => {
    await signInAsOnOrigin(page, baseUrl);

    const response = await page.goto(route("/saved"), {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("body")).toBeVisible();
  });
});
