import { test, expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { Client } from "pg";
import {
  createThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  injectSession,
  loadEnvLocalForE2E,
} from "./helpers/auth";

// A real linked restaurant, contest, and entity must come from SAN-1483.
// Never fabricate the mapping or cast against the public contest without a scoped QA account.
loadEnvLocalForE2E();
// Local OS Chrome fallback; CI uses its pinned Playwright browser by default.
test.use({ launchOptions: process.env.MDE_E2E_CHROME_PATH
  ? { executablePath: process.env.MDE_E2E_CHROME_PATH } : {} });
const restaurantId = process.env.SAN1469_TEST_RESTAURANT_ID;
const contestId = process.env.SAN1469_TEST_CONTEST_ID;
const entityId = process.env.SAN1469_TEST_ENTITY_ID;
const dbUrl = process.env.SUPABASE_DB_URL;
const configured = Boolean(hasE2eEnv() && dbUrl && restaurantId && contestId && entityId);

/**
 * A second browser context has NO localStorage key. It must still recover the original
 * receipt through the account-scoped server read — that is what makes voting cross-device.
 * Extracted so the journey test stays readable and under the complexity limit.
 */
async function proveSecondBrowserRecovery(
  browser: Browser,
  session: Awaited<ReturnType<typeof getTestSession>>,
  ids: { restaurantId: string; contestId: string; entityId: string; userId: string },
  receipt: string,
  countBallots: () => Promise<unknown[]>,
): Promise<void> {
  const secondContext = await browser.newContext({
    baseURL: test.info().project.use.baseURL as string,
  });
  try {
    await injectSession(secondContext, session);
    const secondPage = await secondContext.newPage();
    await secondPage.goto("/restaurants/" + ids.restaurantId + "?contest_id=" + ids.contestId);
    const secondKey = await secondPage.evaluate(({ contest, entity, user }) =>
      localStorage.getItem("mde:restaurant-vote:" + contest + ":" + entity + ":" + user),
      { contest: ids.contestId, entity: ids.entityId, user: ids.userId },
    );
    expect(secondKey).toBeNull();
    // Prove the new context can authenticate against the server read boundary
    // independently of the React panel or any first-browser localStorage.
    const secondRead = await secondPage.request.get("/api/restaurants/my-vote?contest_id=" + ids.contestId);
    expect(secondRead.status(), "second browser must authenticate to my-vote").toBe(200);
    const secondPayload = await secondRead.json() as { receipt?: { vote_id?: string } | null };
    expect(secondPayload.receipt?.vote_id).toBe(receipt);
    await expect(secondPage.getByTestId("vote-receipt-id")).toContainText(receipt, { timeout: 20_000 });
    expect(await countBallots()).toHaveLength(1);
  } finally {
    await secondContext.close();
  }
}

/**
 * Contest selection is the reason this screen exists. One restaurant can contest more
 * than one event, so each contest link must resolve its own ballot, and a foreign or
 * malformed selection must never borrow another contest's ballot.
 */
async function proveContestSelection(
  page: Page,
  db: Client,
  ids: { restaurantId: string; contestId: string },
): Promise<void> {
  const { restaurantId, contestId } = ids;
  // Read the sibling contest from the database rather than inventing it.
  const sibling = await db.query<{ contest_id: string; entity_id: string }>(
    "select e.contest_id, e.id as entity_id from vote.entities e " +
      "join vote.contests c on c.id = e.contest_id " +
      "where e.restaurant_id = $1 and c.kind = 'restaurant' and e.contest_id <> $2 limit 1",
    [restaurantId, contestId],
  );
  if (sibling.rows[0]) {
    await page.goto("/restaurants/" + restaurantId + "?contest_id=" + sibling.rows[0].contest_id);
    await expect(page.getByTestId("vote-cta")).toBeVisible();
  }
  // A well-formed contest id that is not this restaurant's contest. The sentinel below
  // must never become a real contest id.
  await page.goto("/restaurants/" + restaurantId + "?contest_id=11111111-1111-4111-8111-111111111111");
  await expect(page.getByTestId("vote-not-open")).toBeVisible();
  await expect(page.getByTestId("vote-cta")).toHaveCount(0);
  // A malformed selection is rejected before any contest lookup happens.
  await page.goto("/restaurants/" + restaurantId + "?contest_id=not-a-uuid");
  await expect(page.getByTestId("vote-not-open")).toBeVisible();
  await expect(page.getByTestId("vote-cta")).toHaveCount(0);
}

/**
 * Replay the exact saved idempotency key against the deployed service. No nonce means a
 * NEW ballot cannot be created; a committed receipt must come back unchanged.
 */
async function proveIdempotentReplay(
  page: Page,
  session: Awaited<ReturnType<typeof getTestSession>>,
  ids: { contestId: string; entityId: string; userId: string },
  receipt: string,
  countBallots: () => Promise<unknown[]>,
): Promise<void> {
  const key = await page.evaluate(({ contest, entity, user }) =>
    localStorage.getItem("mde:restaurant-vote:" + contest + ":" + entity + ":" + user),
    { contest: ids.contestId, entity: ids.entityId, user: ids.userId },
  );
  expect(key).toBeTruthy();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const replay = await page.request.post(url + "/functions/v1/vote-cast", {
    headers: { apikey: apiKey, Authorization: "Bearer " + session.access_token },
    data: { contest_id: ids.contestId, entity_id: ids.entityId, idempotency_key: key },
  });
  expect(replay.status()).toBe(200);
  const replayBody = await replay.json() as { data: { vote_id: string; status: string } };
  expect(replayBody.data.vote_id).toBe(receipt);
  expect(replayBody.data.status).toBe("replayed");
  expect(await countBallots()).toHaveLength(1);
}

test.describe("SAN-1469 real restaurant vote / database receipt", () => {
  // The dedicated voting gate sets SAN1469_VOTE_E2E=required: missing configuration must FAIL
// there rather than silently skip. Other suites keep the opt-in skip.
if (!configured && process.env.SAN1469_VOTE_E2E === "required") {
  throw new Error(
    "SAN-1469 voting gate requires SAN1469_TEST_RESTAURANT_ID, SAN1469_TEST_CONTEST_ID, " +
      "SAN1469_TEST_ENTITY_ID, E2E auth keys and SUPABASE_DB_URL",
  );
}
test.skip(!configured, "Needs linked SAN-1483 restaurant/entry IDs, E2E Auth keys, and DB read-back access");

  test("contest selection, confirmation, one ballot, saved receipt, reload, idempotent retry and responsive widths", async ({ page, browser }) => {
    const db = new Client({ connectionString: dbUrl });
    await db.connect();
    let userId: string | null = null;
    // Real network + database work, and CI cold starts are slow. An explicit budget keeps a
    // slow run a slow run instead of a flaky one; CI runs with --retries=0 so a retry can
    // never disguise a real failure.
    test.setTimeout(120_000);
    let cleanupError: unknown = null;
    try {
      const phase = await db.query<{ application_phase: string }>(
        "select private.mde_application_phase() as application_phase",
      );
      expect(phase.rows[0]?.application_phase).toBe("development");

      // The same restaurant contests more than one event: each contest-specific link must
      // resolve its own ballot, and a wrong one must not borrow another contest's ballot.
      await proveContestSelection(page, db, { restaurantId: restaurantId!, contestId: contestId! });

      const identity = await createThrowawayIdentity("san1469-voter");
      userId = identity.userId;
      await page.goto("/restaurants/" + restaurantId + "?contest_id=" + contestId);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByTestId("vote-cta")).toBeVisible();
      // Wait for hydration BEFORE clicking. A click on server-rendered HTML has no handler
      // attached yet and silently does nothing, which is exactly how this test failed in CI.
      await expect(page.getByTestId("vote-cta")).toHaveAttribute("data-hydrated", "true");

      // Sign-in now comes FIRST: an unsigned click goes to /login and must NOT open the
      // confirmation dialog. This test follows the real journey, not the old order.
      await page.getByTestId("vote-cta").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // CI starts a cold Next.js dev server: the first /login navigation may compile
      // that route after the click. The trace shows it completing AFTER the default
      // 5-second URL assertion. Still require the exact safe return URL.
      await expect(page).toHaveURL(
        (url) => url.pathname === "/login" && url.searchParams.get("next") === "/restaurants/" + restaurantId + "?contest_id=" + contestId,
        { timeout: 30_000 },
      );
      const session = await getTestSession(identity.email);
      await injectSession(page.context(), session);
      await page.reload(); // /login recognizes the real Supabase session and redirects back.
      // Predicate instead of a constructed RegExp: no dynamic pattern to backtrack on.
      await expect(page).toHaveURL((url) => url.pathname === "/restaurants/" + restaurantId && url.searchParams.get("contest_id") === contestId);
      await expect(page.getByTestId("vote-cta")).toBeVisible();

      await page.getByTestId("vote-cta").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // CI captures the signed-in confirmation dialog, so the visual review is an artifact of a
      // real authenticated run instead of a manual browser session.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "test-results/vote-confirm-390.png" });
      await page.getByTestId("vote-cancel").click();

      const countBallots = async () => {
        const result = await db.query<{ id: string; entity_id: string }>(
          "select id,entity_id from vote.votes where voter_user_id=$1 and contest_id=$2 and restaurant_ballot=true",
          [userId, contestId],
        );
        return result.rows;
      };
      expect(await countBallots()).toHaveLength(0);

      await page.getByTestId("vote-cta").click();
      await page.getByTestId("vote-confirm").click();
      await expect(page.getByTestId("vote-receipt-id")).toBeVisible({ timeout: 20000 });
      const receipt = (await page.getByTestId("vote-receipt-id").innerText()).replace("Receipt ", "").trim();
      const first = await countBallots();
      expect(first).toHaveLength(1);
      expect(first[0].id).toBe(receipt);
      expect(first[0].entity_id).toBe(entityId);

      await page.reload();
      await expect(page.getByTestId("vote-receipt-id")).toContainText(receipt);
      expect(await countBallots()).toHaveLength(1);

      // A second browser has NO original localStorage: it must recover the same receipt from
      // the account-scoped server read, not from that key.
      await proveSecondBrowserRecovery(
        browser,
        session,
        { restaurantId: restaurantId!, contestId: contestId!, entityId: entityId!, userId: userId! },
        receipt,
        countBallots,
      );

      // Hit the deployed service directly with the exact saved idempotency key: no nonce
      // means a NEW ballot cannot be created, but a committed receipt must replay.
      await proveIdempotentReplay(page, session, { contestId: contestId!, entityId: entityId!, userId: userId! }, receipt, countBallots);

      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 850 });
        await expect(page.getByTestId("vote-receipt")).toBeVisible();
        // The receipt id is real data: mask it before publishing the artifact.
        await page.screenshot({ path: "test-results/vote-receipt-" + width + ".png", mask: [page.getByTestId("vote-receipt-id")] });
        const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(hasOverflow).toBe(false);
      }
    } finally {
      // Cleanup must never replace the test's real result: log failures and keep going.
      try {
        if (userId) {
          // Only delete this run's development-test ballot. Never touch real votes.
          await db.query(
            "delete from vote.votes where voter_user_id=$1 and contest_id=$2 and development_test=true",
            [userId, contestId],
          );
          const admin = await getSupabaseAdmin();
          const { error } = await admin.auth.admin.deleteUser(userId);
          if (error) throw error;
        }
      } catch (err) {
        cleanupError = err;
        console.error("[san1469] cleanup failed:", err instanceof Error ? err.message : err);
      } finally {
        // Always close the connection, even when cleanup threw.
        await db.end().catch(() => {});
      }
    }
    // Visible, but never a substitute for the real failure: rethrow only if the test passed.
    if (cleanupError) throw cleanupError;
  });
});
