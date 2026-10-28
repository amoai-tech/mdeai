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

  test("a new customer sees Personal and Events creation with no root agent runtime", async ({
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
      await expect(page.getByTestId("workspace-card-events")).toBeVisible();
      await expect(
        page.getByTestId("workspace-card-events").getByRole("link", { name: /Open/ }),
      ).toHaveAttribute("href", "/app/events");
      await expect(page.getByTestId("workspace-card-partners")).toHaveCount(0);
      await expect(page.getByTestId("workspace-card-team")).toHaveCount(0);

      // Events is available before the first event; the switcher has two choices.
      await expect(page.getByTestId("workspace-switcher")).toBeVisible();
      await page.getByTestId("workspace-switcher").click();
      await expect(page.getByTestId("workspace-switcher-events")).toBeVisible();

      // /app has no chat in Phase 1, so the root concierge provider must not
      // open a runtime connection here.
      expect(copilotRequests).toEqual([]);

      // An expired or cleared session must fail closed, with the exact return path.
      await page.context().clearCookies();
      await page.goto("/app");
      await expect(page).toHaveURL(/\/login\?/);
      expect(page.url()).toContain(`next=${encodeURIComponent("/app")}`);
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
      await expect(page.getByTestId("workspace-card-events")).toBeVisible();
      await expect(page.getByTestId("workspace-card-partners")).toHaveCount(0);

      // Private Rentals and Team appear alongside Personal and Events.
      await expect(page.getByTestId("workspace-switcher")).toBeVisible();
      await page.getByTestId("workspace-switcher").click();
      await expect(page.getByTestId("workspace-switcher-personal")).toBeVisible();
      await expect(page.getByTestId("workspace-switcher-rentals")).toBeVisible();
      await expect(page.getByTestId("workspace-switcher-events")).toBeVisible();
      await expect(page.getByTestId("workspace-switcher-team")).toBeVisible();
      await expect(page.getByTestId("workspace-switcher-partners")).toHaveCount(0);

      // 390px: no horizontal overflow and every header control is a 44px target.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.getByTestId("workspace-switcher")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
      const undersized = await page.evaluate(() =>
        [...document.querySelectorAll("header a, header button")]
          .filter((element) => element.getBoundingClientRect().height < 44)
          .map((element) => element.textContent?.trim() ?? ""),
      );
      expect(undersized).toEqual([]);
    } finally {
      await admin.from("user_roles").delete().eq("user_id", identity.userId);
      await admin
        .from("landlord_profiles")
        .delete()
        .eq("user_id", identity.userId);
      await deleteThrowawayIdentity(identity);
    }
  });

  test("real multi-business choices are scoped to the signed-in user", async ({
    browser,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const owner = await createThrowawayIdentity("san-1575-multipartner");
    const other = await createThrowawayIdentity("san-1575-outsider");
    const admin = await getSupabaseAdmin();
    const createdIds: string[] = [];
    const ownerContext = await browser.newContext();
    const otherContext = await browser.newContext();

    try {
      const { data: partners, error } = await admin.from("partners").insert([
        { profile_id: owner.userId, type: "venue", status: "draft",
          settings: { businessName: "SAN1575 First Business" } },
        { profile_id: owner.userId, type: "developer", status: "draft",
          settings: { businessName: "SAN1575 Second Business" } },
        { profile_id: other.userId, type: "venue", status: "draft",
          settings: { businessName: "SAN1575 Other Business" } },
      ]).select("id, profile_id");
      expect(error, error?.message).toBeNull();
      expect(partners).toHaveLength(3);
      createdIds.push(...(partners ?? []).map((p) => p.id));
      const { error: joinError } = await admin.from("partner_members").insert(
        (partners ?? []).map((p) => ({
          partner_id: p.id, profile_id: p.profile_id, role: "owner" as const,
        })),
      );
      expect(joinError, joinError?.message).toBeNull();

      const a = await ownerContext.newPage();
      const b = await otherContext.newPage();
      await signInAsOnOrigin(a, origin, owner.email);
      await signInAsOnOrigin(b, origin, other.email);
      await Promise.all([a.goto("/app"), b.goto("/app")]);
      await expect(a.getByTestId("workspace-card-partners")).toContainText("Partners");
      await expect(a.getByTestId("workspace-switcher")).toBeVisible();
      await a.getByTestId("workspace-switcher").click();
      await expect(a.getByTestId("workspace-switcher-partners")).toBeVisible();
      await expect(b.getByTestId("workspace-card-partners"))
        .toContainText("SAN1575 Other Business");
      await expect(b.getByText("SAN1575 First Business")).toHaveCount(0);
      await expect(b.getByText("SAN1575 Second Business")).toHaveCount(0);
      await b.goto(`/partners/profile?partner=${createdIds[0]}`);
      await expect(b.getByTestId("partner-profile-load-error")).toBeVisible();

      // Revoking the membership must remove the destination on the next render.
      const revoked = await admin
        .from("partner_members")
        .delete()
        .eq("profile_id", owner.userId);
      expect(revoked.error, revoked.error?.message).toBeNull();
      await a.goto(`${origin}/app`);
      await expect(a.getByTestId("workspace-card-partners")).toHaveCount(0);
    } finally {
      await Promise.allSettled([ownerContext.close(), otherContext.close()]);
      if (createdIds.length) {
        const members = await admin.from("partner_members").delete().in("partner_id", createdIds);
        const partners = await admin.from("partners").delete().in("id", createdIds);
        expect(members.error, members.error?.message).toBeNull();
        expect(partners.error, partners.error?.message).toBeNull();
      }
      await Promise.all([deleteThrowawayIdentity(owner), deleteThrowawayIdentity(other)]);
    }
  });
});

test.describe("legacy destinations without chat", { tag: ["@app"] }, () => {
  test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");

  test("legacy ticket wallet and detail never start the root concierge runtime", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const identity = await createThrowawayIdentity("san1585-wallet-agentless");
    const copilotRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/copilotkit")) {
        copilotRequests.push(request.url());
      }
    });

    try {
      await signInAsOnOrigin(page, origin, identity.email);
      await page.goto("/me/tickets");
      await expect(page.getByRole("heading", { name: "My tickets" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to chat" }).first()).toHaveAttribute(
        "href", "/chat",
      );
      // React may keep background connections open; the visible page state
      // above is the readiness signal. Allow the browser to flush the
      // settled component effects before asserting no agent traffic.
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      expect(copilotRequests, "legacy wallet must not mount a discovery agent").toEqual([]);

      // The rehosted personal wallet must also avoid the root Concierge.
      await page.goto("/app/me/tickets");
      await expect(page.getByRole("heading", { name: "Tickets", exact: true })).toBeVisible();
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      expect(copilotRequests, "personal wallet must not mount a discovery agent").toEqual([]);

      // This signed-in buyer has no such order. The existing server-side
      // ownership check must keep its normal recovery UI, not start AI.
      await page.goto("/me/tickets/00000000-0000-0000-0000-000000000000");
      await expect(
        page.getByText("Open this page from your ticket email link", { exact: false }),
      ).toBeVisible();
      // React may keep background connections open; the visible page state
      // above is the readiness signal. Allow the browser to flush the
      // settled component effects before asserting no agent traffic.
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      expect(copilotRequests, "ticket detail must not mount a discovery agent").toEqual([]);

      // Email-linked ticket detail remains reachable by guests (the token is
      // still validated by the unchanged ticket loader).
      await page.context().clearCookies();
      await page.reload();
      await expect(
        page.getByText("Open this page from your ticket email link", { exact: false }),
      ).toBeVisible();
      // React may keep background connections open; the visible page state
      // above is the readiness signal. Allow the browser to flush the
      // settled component effects before asserting no agent traffic.
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      expect(copilotRequests).toEqual([]);
    } finally {
      await deleteThrowawayIdentity(identity);
    }
  });

  test("rentals and admin pages start no agent runtime", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const identity = await createThrowawayIdentity("san1575-no-agent");
    const admin = await getSupabaseAdmin();

    try {
      const role = await admin
        .from("user_roles")
        .insert({ user_id: identity.userId, role: "admin" });
      expect(role.error, role.error?.message).toBeNull();
      const landlord = await admin.from("landlord_profiles").insert({
        user_id: identity.userId,
        display_name: "SAN-1575 no-agent check",
      });
      expect(landlord.error, landlord.error?.message).toBeNull();

      await signInAsOnOrigin(page, origin, identity.email);

      const copilotRequests: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/api/copilotkit")) {
          copilotRequests.push(request.url());
        }
      });

      await page.goto("/host/rentals");
      await expect(
        page.getByRole("heading", { name: "Your rentals, run by AI" }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(copilotRequests).toEqual([]);

      await page.goto("/admin/contests");
      await expect(
        page.getByRole("heading", { name: "Contests", exact: true, level: 1 }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(copilotRequests).toEqual([]);
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
