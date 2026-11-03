import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  loadEnvLocalForE2E,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "../helpers/auth";

/**
 * SAN-1580 — MDE Team contest management under /app.
 *
 * This is an opt-in write test: it creates real draft contests, then deletes them
 * and proves nothing is left. It is skipped unless the environment explicitly
 * allows the writes, so an ordinary PR run never touches production rows.
 *
 * Run locally:
 *   SAN1580_CONTEST_E2E=1 npx playwright test e2e/app/team-contests.spec.ts \
 *     --project=chromium --workers=1
 */
loadEnvLocalForE2E();

const dbUrl = process.env.SUPABASE_DB_URL;
const writesAllowed =
  process.env.SAN1580_CONTEST_E2E === "1" && hasE2eEnv() && Boolean(dbUrl);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_PREFIX = "[E2E SAN-1580] ";

test.describe("SAN-1580 /app contests guest guard", { tag: ["@app", "@admin"] }, () => {
  test("a guest is sent to login and returns to the exact contest path", async ({
    page,
  }) => {
    await page.goto("/app/contests");
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/app/contests");
  });
});

test.describe("SAN-1580 MDE Team contests", { tag: ["@app", "@admin"] }, () => {
  test.skip(
    !writesAllowed,
    "Needs SAN1580_CONTEST_E2E=1, Supabase service role and SUPABASE_DB_URL (creates then deletes real rows)",
  );

  test.setTimeout(300_000);

  test("admin and super_admin manage contests; nominees persist; non-admins are denied", async ({
    browser,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const suffix = randomUUID().slice(0, 8);
    const db = new Client({ connectionString: dbUrl });
    await db.connect();
    const admin = await getSupabaseAdmin();
    const identities: ThrowawayIdentity[] = [];
    const contexts: BrowserContext[] = [];
    const contestIds: string[] = [];

    const newPage = async (): Promise<Page> => {
      const context = await browser.newContext();
      contexts.push(context);
      return context.newPage();
    };
    // A dev server can abort one navigation while compiling the next route. The server
    // answered 200 in the failing run, so retry the navigation once instead of masking a
    // product defect.
    const gotoStable = async (page: Page, url: string) => {
      try {
        return await page.goto(url, { waitUntil: "domcontentloaded" });
      } catch (error) {
        if (!String(error).includes("ERR_ABORTED")) throw error;
        return page.goto(url, { waitUntil: "domcontentloaded" });
      }
    };
    const newIdentity = async (label: string): Promise<ThrowawayIdentity> => {
      const identity = await createThrowawayIdentity(label);
      identities.push(identity);
      return identity;
    };
    const hideFromPublicDiscovery = async (contestId: string) => {
      // The created row is a real draft. Hide it from the public list while the test runs.
      await db.query("update vote.contests set is_test_fixture = true where id = $1", [
        contestId,
      ]);
    };

    try {
      const adminIdentity = await newIdentity("san1580-admin");
      const { error: adminRoleError } = await admin
        .from("user_roles")
        .insert({ user_id: adminIdentity.userId, role: "admin" });
      expect(adminRoleError, adminRoleError?.message).toBeNull();

      // 1. Admin can load the team list and create a contest.
      const adminPage = await newPage();
      await signInAsOnOrigin(adminPage, origin, adminIdentity.email);
      await gotoStable(adminPage, `${origin}/app/contests`);
      await expect(adminPage.getByTestId("app-contests-page")).toBeVisible();
      await expect(adminPage.getByTestId("contest-create-submit")).toBeVisible();
      // A server action needs hydration; the page has no maps/chat, so network idle is safe.
      await adminPage.waitForLoadState("networkidle");

      const title = TITLE_PREFIX + suffix;
      await adminPage.locator('input[name="title"]').fill(title);
      await adminPage.locator('input[name="description"]').fill("Created by the SAN-1580 E2E.");
      await adminPage.getByTestId("contest-create-submit").click();
      await adminPage.waitForURL(/\/app\/contests\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      const contestId = adminPage.url().split("/").pop() ?? "";
      expect(contestId).toMatch(UUID_RE);
      contestIds.push(contestId);
      await hideFromPublicDiscovery(contestId);
      await expect(adminPage.getByTestId("app-contest-detail")).toBeVisible();

      // Persisted row + audit with the verified actor.
      const created = await db.query<{ title: string; status: string }>(
        "select title, status from vote.contests where id = $1",
        [contestId],
      );
      expect(created.rows[0]).toMatchObject({ title, status: "draft" });
      const createAudit = await db.query<{ actor_user_id: string }>(
        "select actor_user_id from vote.contest_audit where contest_id = $1 and action = 'contest.create'",
        [contestId],
      );
      expect(createAudit.rows.some((row) => row.actor_user_id === adminIdentity.userId)).toBe(true);

      // 2. The app list links back to the app detail, not the legacy route.
      await gotoStable(adminPage, `${origin}/app/contests`);
      const row = adminPage.getByTestId("contest-row-" + contestId);
      await expect(row).toContainText(title);
      expect(await row.getByRole("link").getAttribute("href")).toBe(
        `/app/contests/${contestId}`,
      );

      // 3. Details save persists in the database.
      await gotoStable(adminPage, `${origin}/app/contests/${contestId}`);
      await adminPage.waitForLoadState("networkidle");
      const updatedTitle = title + " updated";
      await adminPage.locator('input[name="title"]').fill(updatedTitle);
      await adminPage.getByTestId("contest-update-submit").click();
      await expect(adminPage.locator("h1")).toHaveText(updatedTitle, { timeout: 20_000 });
      await expect
        .poll(
          async () =>
            (
              await db.query<{ title: string }>("select title from vote.contests where id = $1", [
                contestId,
              ])
            ).rows[0]?.title,
          { timeout: 20_000 },
        )
        .toBe(updatedTitle);

      // 4. Nominee link persists, then removal keeps the entry (ballots preserved).
      await adminPage.getByTestId("contest-picker-search").fill("Carmen");
      await adminPage
        .locator('[data-testid="contest-picker-option"][data-restaurant-name="Carmen"]')
        .check();
      await adminPage.getByTestId("contest-link-submit").click();
      await expect(adminPage.getByTestId("contest-link-result")).toBeVisible({
        timeout: 20_000,
      });
      await expect
        .poll(
          async () =>
            (
              await db.query(
                "select id from vote.entities where contest_id = $1 and restaurant_id is not null",
                [contestId],
              )
            ).rowCount,
          { timeout: 20_000 },
        )
        .toBe(1);
      const entry = await db.query<{ id: string; restaurant_id: string }>(
        "select id, restaurant_id from vote.entities where contest_id = $1 and restaurant_id is not null",
        [contestId],
      );
      const entityId = entry.rows[0].id;
      await adminPage.reload();
      await expect(adminPage.getByTestId("contest-entry-" + entityId)).toContainText(
        "linked",
      );

      adminPage.once("dialog", (dialog) => void dialog.accept());
      await adminPage.getByTestId("contest-unlink-submit").click();
      await expect(adminPage.getByTestId("contest-entry-" + entityId)).toContainText(
        "unlinked (ballots preserved)",
        { timeout: 20_000 },
      );
      const unlinked = await db.query<{ restaurant_id: string | null }>(
        "select restaurant_id from vote.entities where id = $1",
        [entityId],
      );
      expect(unlinked.rows[0].restaurant_id).toBeNull();

      // 5. Replaying the same request id creates exactly one contest.
      const requestId = randomUUID();
      const rpc = async () =>
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/admin_contest_create`, {
          method: "POST",
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
            Authorization: "Bearer " + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_actor: adminIdentity.userId,
            p_title: TITLE_PREFIX + "idempotent " + suffix,
            p_request_id: requestId,
          }),
        });
      const first = await rpc();
      const second = await rpc();
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      const firstBody = (await first.json()) as { contest_id: string };
      const secondBody = (await second.json()) as { contest_id: string };
      expect(secondBody.contest_id).toBe(firstBody.contest_id);
      contestIds.push(firstBody.contest_id);
      await hideFromPublicDiscovery(firstBody.contest_id);
      const idempotentRows = await db.query<{ n: number }>(
        "select count(*)::int as n from vote.contests where id = $1",
        [firstBody.contest_id],
      );
      expect(idempotentRows.rows[0].n).toBe(1);

      // 6. Super Admin gets the same workspace and can write.
      const superIdentity = await newIdentity("san1580-superadmin");
      const { error: superRoleError } = await admin
        .from("user_roles")
        .insert({ user_id: superIdentity.userId, role: "super_admin" });
      expect(superRoleError, superRoleError?.message).toBeNull();
      const superPage = await newPage();
      await signInAsOnOrigin(superPage, origin, superIdentity.email);
      await gotoStable(superPage, `${origin}/app/contests`);
      await expect(superPage.getByTestId("contest-row-" + contestId)).toBeVisible();
      await gotoStable(superPage, `${origin}/app/contests/${contestId}`);
      await expect(superPage.getByTestId("app-contest-detail")).toBeVisible();
      await superPage.waitForLoadState("networkidle");
      const superTitle = updatedTitle + " super";
      await superPage.locator('input[name="title"]').fill(superTitle);
      await superPage.getByTestId("contest-update-submit").click();
      await expect
        .poll(
          async () =>
            (
              await db.query<{ title: string }>("select title from vote.contests where id = $1", [
                contestId,
              ])
            ).rows[0]?.title,
          { timeout: 20_000 },
        )
        .toBe(superTitle);

      // 7. Customer and restaurant partner are denied at the page, not just hidden UI.
      const customer = await newIdentity("san1580-customer");
      const partner = await newIdentity("san1580-partner");
      const { error: landlordError } = await admin
        .from("landlord_profiles")
        .insert({ user_id: partner.userId, display_name: "SAN-1580 QA Partner" });
      expect(landlordError, landlordError?.message).toBeNull();

      for (const identity of [customer, partner]) {
        const deniedPage = await newPage();
        await signInAsOnOrigin(deniedPage, origin, identity.email);
        await gotoStable(deniedPage, `${origin}/app/contests`);
        await expect(deniedPage.getByTestId("app-not-authorized")).toContainText(
          "Admin access required",
        );
        await expect(deniedPage.getByTestId("contest-create-submit")).toHaveCount(0);
        await expect(deniedPage.getByTestId("contest-row-" + contestId)).toHaveCount(0);
        await gotoStable(deniedPage, `${origin}/app/contests/${contestId}`);
        await expect(deniedPage.getByTestId("app-not-authorized")).toBeVisible();
        await expect(deniedPage.locator('input[name="title"]')).toHaveCount(0);
        await gotoStable(deniedPage, `${origin}/admin/contests`);
        await expect(deniedPage.getByTestId("admin-not-authorized")).toBeVisible();
        await expect(deniedPage.getByTestId("contest-create-submit")).toHaveCount(0);
        await gotoStable(deniedPage, `${origin}/admin/contests/${contestId}`);
        await expect(deniedPage.getByTestId("admin-not-authorized")).toBeVisible();
      }

      // The service-role RPC is not callable with a customer session.
      const customerSession = await getTestSession(customer.email);
      const anonKey =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        "";
      const deniedRpc = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/admin_contest_create`,
        {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: "Bearer " + customerSession.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_actor: customer.userId,
            p_title: TITLE_PREFIX + "should-not-exist " + suffix,
          }),
        },
      );
      expect(deniedRpc.status).toBeGreaterThanOrEqual(400);
      const forbiddenTitle = await db.query<{ n: number }>(
        "select count(*)::int as n from vote.contests where title = $1",
        [TITLE_PREFIX + "should-not-exist " + suffix],
      );
      expect(forbiddenTitle.rows[0].n).toBe(0);

      // 8. Foreign or missing contest ids are a 404 after the role gate.
      const foreign = await gotoStable(adminPage, `${origin}/app/contests/${randomUUID()}`);
      expect(foreign?.status()).toBe(404);
      const noAppAdmin = await gotoStable(adminPage, `${origin}/app/admin/contests`);
      expect(noAppAdmin?.status()).toBe(404);

      // 9. Legacy routes still work, and legacy create stays on the legacy path.
      await gotoStable(adminPage, `${origin}/admin/contests`);
      await expect(adminPage.getByTestId("admin-contests-page")).toBeVisible();
      await expect(adminPage.getByTestId("contest-create-submit")).toBeVisible();
      await adminPage.waitForLoadState("networkidle");
      const legacyTitle = TITLE_PREFIX + "legacy " + suffix;
      await adminPage.locator('input[name="title"]').fill(legacyTitle);
      await adminPage.getByTestId("contest-create-submit").click();
      await adminPage.waitForURL(/\/admin\/contests\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      const legacyId = adminPage.url().split("/").pop() ?? "";
      expect(legacyId).toMatch(UUID_RE);
      contestIds.push(legacyId);
      await hideFromPublicDiscovery(legacyId);
      await expect(adminPage.getByTestId("admin-contest-detail")).toBeVisible();
      await gotoStable(adminPage, `${origin}/admin/contests/${contestId}`);
      await expect(adminPage.getByTestId("admin-contest-detail")).toContainText(
        superTitle,
      );

      // 10. Mobile: the list/create and the detail fit 390px without sideways scroll.
      for (const width of [390, 1440]) {
        await adminPage.setViewportSize({ width, height: 900 });
        await gotoStable(adminPage, `${origin}/app/contests`);
        await expect(adminPage.getByTestId("app-contests-page")).toBeVisible();
        await expect(adminPage.getByTestId("contest-create-submit")).toBeVisible();
        const listOverflow = await adminPage.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(listOverflow, "list must not overflow at " + width).toBeLessThanOrEqual(1);
        await adminPage.screenshot({
          fullPage: true,
          path: "test-results/san-1580-app-contests-" + width + ".png",
        });

        await gotoStable(adminPage, `${origin}/app/contests/${contestId}`);
        await expect(adminPage.getByTestId("app-contest-detail")).toBeVisible();
        const detailOverflow = await adminPage.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(detailOverflow, "detail must not overflow at " + width).toBeLessThanOrEqual(1);
        await adminPage.screenshot({
          fullPage: true,
          path: "test-results/san-1580-app-contest-detail-" + width + ".png",
        });
      }
    } finally {
      for (const context of contexts) await context.close();

      try {
        if (contestIds.length > 0) {
          await db.query("delete from vote.contests where id = any($1::uuid[])", [contestIds]);
        }
        // Remove every grant this test created, then the identities themselves.
        for (const identity of identities) {
          const { error: roleError } = await admin
            .from("user_roles")
            .delete()
            .eq("user_id", identity.userId);
          if (roleError) throw new Error("role cleanup: " + roleError.message);
          const { error: landlordDeleteError } = await admin
            .from("landlord_profiles")
            .delete()
            .eq("user_id", identity.userId);
          if (landlordDeleteError) throw new Error("landlord cleanup: " + landlordDeleteError.message);
        }
        for (const identity of identities) await deleteThrowawayIdentity(identity);

        const leftovers = await db.query<{ n: number }>(
          "select count(*)::int as n from vote.contests where title like $1",
          [TITLE_PREFIX + "%"],
        );
        expect(leftovers.rows[0].n).toBe(0);
        const roleLeft = await db.query<{ n: number }>(
          "select count(*)::int as n from public.user_roles where user_id = any($1::uuid[])",
          [identities.map((identity) => identity.userId)],
        );
        expect(roleLeft.rows[0].n).toBe(0);
      } finally {
        await db.end();
      }
    }
  });
});
