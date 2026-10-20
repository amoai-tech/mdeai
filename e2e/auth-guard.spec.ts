import { test, expect } from "@playwright/test";

// Match the voting E2E runner: CI uses Playwright Chromium, while local Ubuntu
// installations can opt into the system Chrome binary without changing CI.
test.use({ launchOptions: process.env.MDE_E2E_CHROME_PATH
  ? { executablePath: process.env.MDE_E2E_CHROME_PATH } : {} });

// AUTH-005 — deterministic auth-guard journeys.
//
// Completing a magic link (needs an inbox) or Google OAuth (needs Google consent)
// can't be automated here — those are covered by the manual production smoke.
// This suite asserts the guard logic that needs no real session: protected-route
// redirects, the guest ticket-view exemption, the passwordless login/signup UI,
// signout, and auth-callback error handling.

const PROTECTED_ROUTES = ["/trips", "/saved", "/host/event/new", "/me/tickets"];

test.describe("AUTH-005 auth guards", { tag: ["@auth", "@smoke"] }, () => {
  for (const route of PROTECTED_ROUTES) {
    test(`anonymous ${route} redirects to /login with next`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login\?/);
      expect(page.url()).toContain(`next=${encodeURIComponent(route)}`);
    });
  }

  test("guest ticket-view subpath stays public (no login redirect)", async ({
    page,
  }) => {
    // /me/tickets/[id] is the guest QR view (email link carries ?token=). The
    // middleware guard is exact-match on /me/tickets, so deeper paths must pass.
    const res = await page.goto("/me/tickets/00000000-0000-0000-0000-000000000000");
    expect(page.url()).not.toContain("/login");
    expect(page.url()).toContain("/me/tickets/");
    // A missing ticket may 404, but the public guest path must never 5xx —
    // that would be a real regression, which a URL-only check would miss.
    expect(res?.status()).toBeLessThan(500);
  });

  test("login page renders passwordless options", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Email magic link" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
  });

  test("login form rejects unsafe return links but keeps contest context", async ({ page }) => {
    // Exercise the real Next.js login route, not just the safeNextPath unit helper.
    // Both passwordless entry points must receive the sanitized same-site target.
    for (const unsafe of ["/\\external.example", "//external.example", "https://external.example"]) {
      await page.goto("/login?next=" + encodeURIComponent(unsafe));
      const returns = page.locator('form input[name="next"]');
      await expect(returns).toHaveCount(2);
      await expect(returns.nth(0)).toHaveValue("/");
      await expect(returns.nth(1)).toHaveValue("/");
    }

    const valid = "/restaurants/restaurant-id?contest_id=contest-id";
    await page.goto("/login?next=" + encodeURIComponent(valid));
    const returns = page.locator('form input[name="next"]');
    await expect(returns).toHaveCount(2);
    await expect(returns.nth(0)).toHaveValue(valid);
    await expect(returns.nth(1)).toHaveValue(valid);
  });

  test("signup page renders passwordless options", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("button", { name: "Email magic link" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  });

  test("signout POST clears session and redirects home", async ({ request }) => {
    const res = await request.post("/auth/signout", { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toMatch(/\/$/);
  });

  test("auth callback without code redirects to /login with error", async ({
    request,
  }) => {
    const res = await request.get("/auth/callback", { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
    expect(res.headers()["location"]).toContain(
      "error=auth_callback_missing_code",
    );
  });

  test("provider error on a normal path relays to /login", async ({ page }) => {
    await page.goto("/?error=access_denied");
    await expect(page).toHaveURL(/\/login\?/);
    expect(page.url()).toContain("error=access_denied");
  });
});
