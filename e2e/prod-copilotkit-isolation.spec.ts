import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";
import { gotoConcierge, sendConciergeMessage, waitForCopilotIdle } from "./helpers/maps-layout";

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

/** Build an absolute URL without doubling slashes on a trailing-slash base. */
const route = (path: string) => new URL(path, `${baseUrl}/`).toString();

const ANONYMOUS_RESOURCE_ID = "anonymous";
const runMarker = `san547-${Date.now().toString(36)}`;

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

  test("anonymous callers reach neither the runtime nor a named thread", async ({ request }) => {
    const info = await request.get(route("/api/copilotkit/info"));
    expect(info.status(), "unauthenticated info").toBe(401);

    const named = await request.post(route("/api/copilotkit"), {
      data: realRunBody(`${runMarker}-anonymous`),
    });
    expect(named.status(), "unauthenticated run naming a thread").toBe(401);
  });

  test("User A's real signed-in turn persists a thread owned by User A", async ({ page }) => {
    test.setTimeout(240_000);
    await signInAsOnOrigin(page, baseUrl, userA.email);
    await gotoConcierge(page);
    await sendConciergeMessage(page, "ping");
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

    // The stored owner is the server-derived user id — never the shared bucket,
    // never the client's own threadId.
    for (const row of owned) {
      expect(row.resourceId, `thread ${row.id} owner`).toBe(userA.userId);
      expect(row.resourceId).not.toBe(ANONYMOUS_RESOURCE_ID);
      expect(row.resourceId).not.toBe(row.id);
    }
  });

  test("User B is refused User A's thread before the runtime executes", async ({ page }) => {
    await signInAsOnOrigin(page, baseUrl, userB.email);

    const res = await page.request.post(route("/api/copilotkit"), {
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

  test("User A is not refused by the gate for their own thread", async ({ page }) => {
    await signInAsOnOrigin(page, baseUrl, userA.email);

    const res = await page.request.post(route("/api/copilotkit"), {
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
    const messagesForRun = touchedThreadIds.length
      ? (
          await (await getSupabaseAdmin())
            .from("mastra_messages")
            .select("id")
            .in("thread_id", touchedThreadIds)
        ).data ?? []
      : [];

    try {
      await deleteThrowawayIdentity(userA);
      await deleteThrowawayIdentity(userB);
    } finally {
      // Mark the attempt either way: a retry from afterAll would only repeat a
      // delete against rows this test already reported on, producing a second,
      // less precise failure instead of the real one.
      cleanedUp = true;
    }

    expect(await threadsOwnedBy(userA.userId), "User A threads after cleanup").toEqual([]);
    expect(await threadsOwnedBy(userB.userId), "User B threads after cleanup").toEqual([]);

    const admin = await getSupabaseAdmin();
    if (touchedThreadIds.length > 0) {
      const { data: leftover } = await admin
        .from("mastra_messages")
        .select("id")
        .in("thread_id", touchedThreadIds);
      expect(leftover ?? [], "messages for this run's threads after cleanup").toEqual([]);
    }

    // The identities themselves are gone, so the throwaway resources cannot be
    // reused by a later request.
    const deletedA = await admin.auth.admin.getUserById(userA.userId);
    expect(deletedA.data?.user ?? null, "User A identity after cleanup").toBeNull();
    const deletedB = await admin.auth.admin.getUserById(userB.userId);
    expect(deletedB.data?.user ?? null, "User B identity after cleanup").toBeNull();

    // Sanity: the run genuinely had messages to clean, so the assertion above is
    // not vacuously true.
    expect(messagesForRun.length, "records the run created before cleanup").toBeGreaterThan(0);
  });
});
