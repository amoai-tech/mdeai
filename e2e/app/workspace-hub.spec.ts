import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "../helpers/auth";

// Match the auth-guard suite: CI uses Playwright Chromium, local Ubuntu can
// point at the system Chrome without changing CI.
test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});

/**
 * SAN-1575 — the /app shell is fail-closed at the middleware layer and shows a
 * real account only its own destinations. These two requests need no session;
 * the signed-in case uses a throwaway identity and real Supabase.
 */
test.describe("SAN-1575 /app guard", { tag: ["@app", "@auth"] }, () => {
  test("guest /app redirects to login with next", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?/);
    expect(page.url()).toContain(`next=${encodeURIComponent("/app")}`);
    await expect(
      page.getByRole("button", { name: "Email magic link" }),
    ).toBeVisible();
  });

  test("guest /app/me keeps the exact next path", async ({ page }) => {
    await page.goto("/app/me");
    await expect(page).toHaveURL(/\/login\?/);
    expect(page.url()).toContain(`next=${encodeURIComponent("/app/me")}`);
  });
});

test.describe("SAN-1575 signed-in launcher", { tag: ["@app"] }, () => {
  test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

  test("a new customer sees Personal only and starts no agent runtime", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const identity = await createThrowawayIdentity("san-1575-customer");
    const copilotRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/copilotkit")) {
        copilotRequests.push(request.url());
      }
    });

    try {
      await signInAsOnOrigin(page, origin, identity.email);
      await page.goto("/app");

      await expect(page.getByTestId("workspace-grid")).toBeVisible();
      await expect(page.getByTestId("workspace-card-personal")).toBeVisible();
      await expect(page.getByTestId("workspace-card-rentals")).toHaveCount(0);
      await expect(page.getByTestId("workspace-card-events")).toHaveCount(0);
      await expect(page.getByTestId("workspace-card-partners")).toHaveCount(0);
      await expect(page.getByTestId("workspace-card-team")).toHaveCount(0);

      // One context: the switcher is a label, not a menu.
      await expect(page.getByTestId("workspace-current")).toHaveText("Personal");
      await expect(page.getByTestId("workspace-switcher")).toHaveCount(0);

      // /app has no chat in Phase 1, so the root concierge provider must not
      // open a runtime connection here.
      expect(copilotRequests).toEqual([]);
    } finally {
      await deleteThrowawayIdentity(identity);
    }
  });

  test("host and admin memberships add exactly their own workspaces", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const identity = await createThrowawayIdentity("san-1575-roles");
    const admin = await getSupabaseAdmin();

    try {
      const host = await admin.from("landlord_profiles").insert({
        user_id: identity.userId,
        display_name: "SAN-1575 QA Host",
      });
      expect(host.error, host.error?.message).toBeNull();

      const role = await admin
        .from("user_roles")
        .insert({ user_id: identity.userId, role: "admin" });
      expect(role.error, role.error?.message).toBeNull();

      await signInAsOnOrigin(page, origin, identity.email);
      await page.goto("/app");

      await expect(page.getByTestId("workspace-card-personal")).toBeVisible();
      await expect(page.getByTestId("workspace-card-rentals")).toBeVisible();
      await expect(page.getByTestId("workspace-card-team")).toBeVisible();
      await expect(page.getByTestId("workspace-card-events")).toHaveCount(0);
      await expect(page.getByTestId("workspace-card-partners")).toHaveCount(0);

      // More than one context: the switcher lists exactly these three.
      await expect(page.getByTestId("workspace-switcher")).toBeVisible();
      await page.getByTestId("workspace-switcher").click();
      await expect(page.getByTestId("workspace-switcher-personal")).toBeVisible();
      await expect(page.getByTestId("workspace-switcher-rentals")).toBeVisible();
      await expect(page.getByTestId("workspace-switcher-team")).toBeVisible();
      await expect(page.getByTestId("workspace-switcher-partners")).toHaveCount(0);
    } finally {
      await admin.from("user_roles").delete().eq("user_id", identity.userId);
      await admin
        .from("landlord_profiles")
        .delete()
        .eq("user_id", identity.userId);
      await deleteThrowawayIdentity(identity);
    }
  });
});
