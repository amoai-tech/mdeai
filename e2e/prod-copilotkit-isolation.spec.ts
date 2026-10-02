import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";
import { gotoConcierge, sendConciergeMessage, waitForCopilotIdle } from "./helpers/maps-layout";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";

/**
 * SAN-547 · D17 — live User A / User B isolation proof against a deployed environment.
 *
 * What this adds over the unit matrix in `src/lib/copilotkit-auth.test.ts`: those
 * tests prove the *decision* function, but they cannot prove that the deployed
 * route reads real production rows and reaches the same verdict. This spec drives
 * the real production deployment and asserts the durable postcondition in the
 * real database.
 *
 * Two properties are proven, and they are deliberately separate:
 *
 *   1. Write path — a real signed-in concierge turn persists a thread whose
 *      stored `resourceId` is that user's server-derived id, not the legacy
 *      shared `anonymous` bucket and not the client's `threadId`.
 *   2. Read/run gate — a second real user naming that exact thread is refused
 *      `403` *before* CopilotKit/Mastra executes, and an anonymous caller gets
 *      `401`, while the owner is not refused.
 *
 * Identities are per-run throwaways so "which rows belong to this run?" is
 * answerable by query alone, and cleanup is proven by re-query rather than
 * assumed. Service-role credentials stay in the Playwright process — they are
 * never injected into a browser context.
 *
 * Runs only when PROD_SMOKE_BASE_URL is set AND the Supabase e2e env is present.
 * When a target is configured but credentials are missing, this FAILS loudly
 * instead of skipping to green — a skipped isolation proof must never be
 * reported as a passing one.
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const enabled = Boolean(baseUrl);
/** Protected Vercel previews need the automation bypass; production does not. */
const isVercelPreview = /\.vercel\.app$/i.test(baseUrl ? new URL(baseUrl).hostname : "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";

/** Build an absolute URL without doubling slashes on a trailing-slash base. */
const route = (path: string) => new URL(path, `${baseUrl}/`).toString();

const ANONYMOUS_RESOURCE_ID = "anonymous";
const runMarker = `san547-${Date.now().toString(36)}`;
/** Only User A's conversation contains this; no refused response may echo it. */
const privateMarker = `${runMarker}-private-${randomUUID().slice(0, 8)}`;

/**
 * The exact request shape a real browser sends to `/api/copilotkit`, captured
 * from live production traffic:
 *
 *   {"method":"agent/connect","params":{"agentId":"conciergeAgent"},
 *    "body":{"threadId":"…","runId":"…","messages":[…],"tools":[…]}}
 *
 * The AG-UI run input — and therefore `threadId` — is nested under `body`. A
 * probe that puts `threadId` at the top level exercises a shape the product never
 * sends, so it can pass while the shipped ownership gate is bypassed for every
 * real user. These probes must use the real shape to be worth anything.
 */
function realRunBody(threadId: string) {
  return {
    method: "agent/connect",
    params: { agentId: "conciergeAgent" },
    body: { threadId, runId: randomUUID(), messages: [], tools: [] },
  };
}

async function expectSignedInRuntimeReached(page: Page): Promise<void> {
  if (!isVercelPreview) return;
  const response = await page.request.post(route("/api/copilotkit/info"), {
    maxRedirects: 0,
    data: { method: "info" },
  });
  const body = await response.text();
  expect(
    response.status(),
    `authenticated runtime info returned ${response.status()}; expected 200. ` +
      `A redirect or HTML response means Vercel protection was measured instead of MDE. ` +
      `Body starts: ${body.slice(0, 80)}`,
  ).toBe(200);
  expect(body, "runtime info must identify MDE/CopilotKit, not Vercel protection").toContain(
    '"agents"',
  );
}

async function signInWithDeploymentAccess(page: Page, email: string): Promise<void> {
  if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
  await signInAsOnOrigin(page, baseUrl, email);
  // Session injection clears cookies, so restore the same-origin bypass cookie.
  if (isVercelPreview) {
    await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
    await expectSignedInRuntimeReached(page);
  }
}

/** Read the durable owner of threads from the real Mastra table (service-role only). */
async function threadsOwnedBy(resourceId: string): Promise<{ id: string; resourceId: string }[]> {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin
    .from("mastra_threads")
    .select("id, resourceId")
    .eq("resourceId", resourceId);
  if (error) throw new Error(`mastra_threads read failed: ${error.message}`);
  return (data ?? []) as { id: string; resourceId: string }[];
}

/** Messages persisted for these threads (service-role only). */
async function messageCount(threadIds: string[]): Promise<number> {
  if (threadIds.length === 0) return 0;
  const admin = await getSupabaseAdmin();
  const { count, error } = await admin
    .from("mastra_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threadIds);
  if (error) throw new Error(`mastra_messages count failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Wait until a turn's persistence has landed and stopped moving. Mastra writes
 * the turn's messages after the stream ends, so "the UI is idle" is not "the
 * database is done": cleaning up in that gap deletes the thread and then the
 * late write leaves orphan messages behind (seen on production 2026-10-02).
 * Two identical consecutive reads at or above `min` count as settled.
 */
async function waitForSettledMessages(threadIds: string[], min: number): Promise<number> {
  let previous = -1;
  let settled = -1;
  await expect
    .poll(
      async () => {
        const current = await messageCount(threadIds);
        settled = current >= min && current === previous ? current : -1;
        previous = current;
        return settled;
      },
      { timeout: 90_000, intervals: [1_000, 2_000, 2_000, 3_000] },
    )
    .toBeGreaterThanOrEqual(min);
  return settled;
}

test.describe("prod CopilotKit per-user isolation (SAN-547 · D17)", () => {
  test.skip(!enabled, "Set PROD_SMOKE_BASE_URL (e.g. https://www.mdeai.co)");
  test.describe.configure({ mode: "serial" });

  let userA: ThrowawayIdentity;
  let userB: ThrowawayIdentity;
  /** The thread User A really created; every later probe names this exact id. */
  let threadId = "";
  /** Thread ids that existed during the run, captured before cleanup deletes them. */
  let touchedThreadIds: string[] = [];
  /** Anonymous thread population before the run — asserted unchanged at the end. */
  let anonymousBaseline = -1;
  let cleanedUp = false;

  test.beforeAll(async () => {
    // Never touch production identities outside a real prod run.
    if (!enabled) return;
    if (isVercelPreview && !bypassSecret) {
      throw new Error(
        "VERCEL_AUTOMATION_BYPASS_SECRET is required for a protected Vercel preview; " +
          "without it SAN-547 would measure Vercel deployment protection instead of MDE auth.",
      );
    }
    if (!hasE2eEnv()) {
      throw new Error(
        "PROD_SMOKE_BASE_URL is set but NEXT_PUBLIC_SUPABASE_URL / public key / " +
          "SUPABASE_SERVICE_ROLE_KEY are missing, so the SAN-547 live isolation " +
          "proof cannot run. Fix the workflow secrets; do not accept a skip as proof.",
      );
    }
    // Capture the baseline BEFORE creating any threads, so the end-of-run
    // assertion proves this run added nothing to the shared bucket.
    const admin = await getSupabaseAdmin();
    const { count, error } = await admin
      .from("mastra_threads")
      .select("id", { count: "exact", head: true })
      .eq("resourceId", ANONYMOUS_RESOURCE_ID);
    if (error) throw new Error(`anonymous baseline read failed: ${error.message}`);
    anonymousBaseline = count ?? -1;

    userA = await createThrowawayIdentity("qa-iso-a");
    userB = await createThrowawayIdentity("qa-iso-b");
  });

  // Safety net: a mid-chain failure must not orphan production rows. The
  // explicit cleanup test below is the proof; this only guarantees the attempt.
  test.afterAll(async () => {
    if (cleanedUp) return;
    // Report failures instead of swallowing them: an unremoved identity means
    // real rows are still sitting in production, and `.catch(() => undefined)`
    // would hide exactly that behind a green run.
    const failures: string[] = [];
    for (const identity of [userA, userB]) {
      if (!identity) continue;
      try {
        await deleteThrowawayIdentity(identity);
      } catch (error) {
        failures.push((error as Error).message);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `post-run cleanup failed — production rows may be orphaned: ${failures.join(" | ")}`,
      );
    }
  });

  test("anonymous callers reach neither the runtime nor a named thread", async ({ page }) => {
    if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);

    const info = await page.request.get(route("/api/copilotkit/info"), {
      maxRedirects: 0,
    });
    const infoBody = await info.text();
    expect(
      info.status(),
      `unauthenticated info returned ${info.status()}; expected MDE 401. ` +
        `A redirect or HTML response means Vercel protection was measured instead of MDE auth. ` +
        `Body starts: ${infoBody.slice(0, 80)}`,
    ).toBe(401);
    expect(infoBody, "401 body must identify MDE auth, not Vercel protection").toContain(
      "unauthorized",
    );

    const named = await page.request.post(route("/api/copilotkit"), {
      maxRedirects: 0,
      data: realRunBody(`${runMarker}-anonymous`),
    });
    expect(named.status(), "unauthenticated run naming a thread").toBe(401);
  });

  test("User A's real signed-in turn persists a thread owned by User A", async ({ page }) => {
    // Ceiling, not latency budget: the flow can legitimately spend up to 120s waiting
    // for CopilotKit to go idle + 90s waiting for durable Mastra persistence, plus
    // auth/navigation overhead. Lowering this below 210s would make valid slow writes flaky.
    test.setTimeout(240_000);
    await signInWithDeploymentAccess(page, userA.email);
    await gotoConcierge(page);
    await sendConciergeMessage(page, `ping ${privateMarker}`);
    await waitForCopilotIdle(page, 120_000);

    // The turn is asynchronous in the app, but the memory write is what we assert.
    // Poll rather than sleep so a fast write passes immediately.
    await expect
      .poll(async () => (await threadsOwnedBy(userA.userId)).length, {
        timeout: 90_000,
        message:
          "User A's signed-in concierge turn produced no mastra_threads row owned by " +
          "User A. Without a real durable thread there is nothing to prove isolation " +
          "against, so this fails instead of silently continuing.",
      })
      .toBeGreaterThan(0);

    const owned = await threadsOwnedBy(userA.userId);
    touchedThreadIds = owned.map((row) => row.id);
    threadId = owned[0].id;
    // The user message and the reply, fully persisted, before anything probes
    // or cleans up this thread.
    await waitForSettledMessages(touchedThreadIds, 2);

    // The stored owner is the server-derived user id — never the shared bucket,
    // never the client's own threadId.
    for (const row of owned) {
      expect(row.resourceId, `thread ${row.id} owner`).toBe(userA.userId);
      expect(row.resourceId).not.toBe(ANONYMOUS_RESOURCE_ID);
      expect(row.resourceId).not.toBe(row.id);
    }
  });

  test("User B is refused User A's thread before the runtime executes", async ({ page }) => {
    await signInWithDeploymentAccess(page, userB.email);

    const res = await page.request.post(route("/api/copilotkit"), {
      maxRedirects: 0,
      data: realRunBody(threadId),
    });
    // 403 (not 401, not 200) is also the proof that the gate actually *read* the
    // nested thread id: if extraction missed it the request would look like
    // "no thread named" and be allowed through to the runtime.
    expect(res.status(), `User B naming User A's thread ${threadId}`).toBe(403);

    // The refusal is the pre-runtime authorization envelope, carrying no
    // conversation content from the thread User B tried to open.
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  test("User B cannot stop User A's thread through the params-only stop shape", async ({ page }) => {
    await signInWithDeploymentAccess(page, userB.email);

    // `agent/stop` is the odd one out: the router reads `threadId` from
    // `params`, not from the `body` run input. A gate that only read
    // `body.threadId` would let User B pair an owned/absent body id with User A's
    // thread in `params` and halt it. Both fields are supplied here so the test
    // fails if extraction ever prefers the body again.
    const res = await page.request.post(route("/api/copilotkit"), {
      maxRedirects: 0,
      data: {
        method: "agent/stop",
        params: { agentId: "conciergeAgent", threadId },
        body: { threadId: `${runMarker}-attacker-owned` },
      },
    });
    expect(
      res.status(),
      `User B stopping User A's thread ${threadId} via params.threadId`,
    ).toBe(403);
  });

  test("User B is refused every CopilotKit thread route on User A's thread", async ({ page }) => {
    await signInWithDeploymentAccess(page, userB.email);

    // SAN-1358 · D20: these arrive as `resource/request` with the thread id in
    // `params.path`, so the body-based gate never sees them; the runtime's
    // fail-closed route allowlist must refuse them. Read-only and per-thread
    // only. NEVER send `threads/clear` here: it would wipe every live
    // conversation on the instance if the allowlist ever regressed. It stays
    // covered by src/__tests__/api/copilotkit-thread-routes-authz.test.ts.
    const probes: Array<{ path: string; httpMethod: string; body?: unknown }> = [
      { path: "/api/copilotkit/threads", httpMethod: "GET" },
      { path: `/api/copilotkit/threads/${threadId}/messages`, httpMethod: "GET" },
      { path: `/api/copilotkit/threads/${threadId}/events`, httpMethod: "GET" },
      { path: `/api/copilotkit/threads/${threadId}/state`, httpMethod: "GET" },
      { path: `/api/copilotkit/threads/${threadId}`, httpMethod: "PATCH", body: { name: runMarker } },
      { path: `/api/copilotkit/threads/${threadId}/archive`, httpMethod: "POST" },
      { path: `/api/copilotkit/threads/${threadId}`, httpMethod: "DELETE" },
    ];
    for (const { path, httpMethod, body } of probes) {
      const res = await page.request.post(route("/api/copilotkit"), {
        maxRedirects: 0,
        data: { method: "resource/request", params: { path, httpMethod }, ...(body ? { body } : {}) },
      });
      const text = await res.text();
      expect(res.status(), `User B ${httpMethod} ${path}`).toBe(403);
      expect(text, `User B ${httpMethod} ${path} leaks no content`).not.toContain(privateMarker);
      expect(text).not.toContain(threadId);
    }

    // The mutations changed nothing: A's thread is still there, still A's.
    const admin = await getSupabaseAdmin();
    const { data, error } = await admin
      .from("mastra_threads")
      .select("resourceId, title")
      .eq("id", threadId)
      .single();
    if (error) throw new Error(`thread re-read failed: ${error.message}`);
    expect(data.resourceId).toBe(userA.userId);
    expect(data.title ?? "").not.toContain(runMarker);
    expect(await messageCount([threadId])).toBeGreaterThanOrEqual(2);
  });

  test("User A is not refused by the gate for their own thread", async ({ page }) => {
    await signInWithDeploymentAccess(page, userA.email);

    const res = await page.request.post(route("/api/copilotkit"), {
      maxRedirects: 0,
      data: realRunBody(threadId),
    });
    // CopilotKit itself may reject the minimal body — that is fine and expected.
    // What must not happen is an authorization refusal: a 401/403 here would mean
    // the owner cannot reach their own thread.
    expect(res.status(), "owner must pass the ownership gate").not.toBe(401);
    expect(res.status(), "owner must pass the ownership gate").not.toBe(403);
  });

  test("the durable owner is unchanged after every probe", async () => {
    const ownerRow = (await threadsOwnedBy(userA.userId)).find((row) => row.id === threadId);
    expect(ownerRow, `thread ${threadId} must still exist`).toBeTruthy();
    expect(ownerRow?.resourceId).toBe(userA.userId);

    // User B's refused request must not have created anything under either
    // resource: not their own, and not a copy of A's thread.
    expect(await threadsOwnedBy(userB.userId)).toEqual([]);
  });

  test("no new row was created under the shared anonymous resource", async () => {
    const admin = await getSupabaseAdmin();
    const { count, error } = await admin
      .from("mastra_threads")
      .select("id", { count: "exact", head: true })
      .eq("resourceId", ANONYMOUS_RESOURCE_ID);
    if (error) throw new Error(`anonymous count read failed: ${error.message}`);
    expect(count, "anonymous threads after the isolation run").toBe(anonymousBaseline);
  });

  test("cleanup removes every row this run created, proven by re-query", async () => {
    test.setTimeout(180_000);
    // Re-read the run's threads (a probe must not have added any, but cleanup
    // covers whatever exists), then let persistence settle BEFORE deleting, so
    // no late write can land after the rows are gone.
    touchedThreadIds = [
      ...new Set([
        ...touchedThreadIds,
        ...(await threadsOwnedBy(userA.userId)).map((row) => row.id),
        ...(await threadsOwnedBy(userB.userId)).map((row) => row.id),
      ]),
    ];
    const messagesForRun = await waitForSettledMessages(touchedThreadIds, 2);

    // Attempt BOTH identities even if the first one fails. Sequential awaits in a
    // try/finally meant a failure on userA skipped userB entirely *and* still set
    // `cleanedUp`, so the afterAll safety net stood down and userB's rows were
    // orphaned in production. Collect every failure, then report.
    const cleanupFailures: string[] = [];
    for (const identity of [userA, userB]) {
      try {
        await deleteThrowawayIdentity(identity);
      } catch (error) {
        cleanupFailures.push((error as Error).message);
      }
    }

    // Both were attempted, so a retry from afterAll would only repeat a delete
    // against rows this test already reported on, producing a second, less
    // precise failure instead of the real one.
    cleanedUp = true;

    if (cleanupFailures.length > 0) {
      throw new Error(
        `cleanup failed — production rows may be orphaned: ${cleanupFailures.join(" | ")}`,
      );
    }

    // Poll to zero rather than reading once: a green result must prove the
    // rows are gone and stay gone, and a write that still lands fails loudly.
    const converge = { timeout: 30_000, intervals: [500, 1_000, 2_000] };
    await expect
      .poll(async () => (await threadsOwnedBy(userA.userId)).length, { ...converge, message: "User A threads after cleanup" })
      .toBe(0);
    await expect
      .poll(async () => (await threadsOwnedBy(userB.userId)).length, { ...converge, message: "User B threads after cleanup" })
      .toBe(0);
    await expect
      .poll(() => messageCount(touchedThreadIds), { ...converge, message: "messages for this run's threads after cleanup" })
      .toBe(0);

    const admin = await getSupabaseAdmin();

    // The identities themselves are gone, so the throwaway resources cannot be
    // reused by a later request.
    const deletedA = await admin.auth.admin.getUserById(userA.userId);
    expect(deletedA.data?.user ?? null, "User A identity after cleanup").toBeNull();
    const deletedB = await admin.auth.admin.getUserById(userB.userId);
    expect(deletedB.data?.user ?? null, "User B identity after cleanup").toBeNull();

    // Sanity: the run genuinely had messages to clean, so the assertion above is
    // not vacuously true.
    expect(messagesForRun, "records the run created before cleanup").toBeGreaterThan(0);
  });
});
