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
import {
  countConciergeReplies,
  gotoConcierge,
  sendConciergeMessage,
  waitForConciergeReply,
  waitForCopilotIdle,
} from "./helpers/maps-layout";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";

/**
 * SAN-1378 · Stage D + SAN-1389 — concierge thread lifecycle on the real /chat surface.
 *
 * Proves the two promises the nav rail makes, end to end, and checks the
 * database rather than the screen. A UI can show a fresh, empty chat while a
 * backend path keeps writing to the old thread, so every claim here is backed
 * by `mastra_messages` rows:
 *
 *   1. New Chat — Sofia stays on /chat, her next message runs on a NEW thread
 *      B ≠ A, B persists it, and A never receives it.
 *   2. Saved chat — clicking thread A in the rail stays on /chat and the next
 *      message continues A (persisted in A, never in B), and A's earlier
 *      messages are shown again, once (SAN-1389).
 *   3. Privacy — another signed-in user, and an anonymous caller, are refused
 *      A's history with no trace of A's content.
 *
 * Steps are `expect.soft` so one broken promise does not hide the others; the
 * test still fails if any of them breaks.
 *
 * Runs only when PROD_SMOKE_BASE_URL is set AND the Supabase e2e env is present,
 * and fails loudly (never skips to green) when a target is set without creds.
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const enabled = Boolean(baseUrl);
const marker = `san1378-${Date.now().toString(36)}`;
/** Protected Vercel previews need the automation bypass; production does not. */
const isVercelPreview = /\.vercel\.app$/i.test(baseUrl ? new URL(baseUrl).hostname : "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";

/** Thread ids of every `agent/run` envelope the browser sends, in order. */
function recordRunThreadIds(page: Page): string[] {
  const ids: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !new URL(request.url()).pathname.startsWith("/api/copilotkit")) {
      return;
    }
    try {
      const envelope = request.postDataJSON() as {
        method?: string;
        body?: { threadId?: string };
      } | null;
      if (envelope?.method === "agent/run" && envelope.body?.threadId) {
        ids.push(envelope.body.threadId);
      }
    } catch {
      // Not a JSON envelope; not a run.
    }
  });
  return ids;
}

/** Persisted user-message count containing `text` in `threadId` (service-role, test process only). */
async function persistedMessagesContaining(
  threadId: string,
  text: string,
  role?: "user" | "assistant",
): Promise<number> {
  const admin = await getSupabaseAdmin();
  let query = admin
    .from("mastra_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .ilike("content", `%${text}%`);
  if (role) query = query.eq("role", role);
  const { count, error } = await query;
  if (error) throw new Error(`mastra_messages read failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Click and report the pathname the page settles on. Success never navigates
 * (both buttons push /chat while already on /chat), so this is a stability
 * window, not a wait for success: a regression pushes a client-side route
 * (the pre-fix bug pushed "/"), which commits well inside the window. The
 * window was checked against a deployment that still had that bug.
 */
async function pathAfterClick(page: Page, click: () => Promise<void>): Promise<string> {
  await click();
  await page
    .waitForURL((url) => url.pathname !== "/chat", { timeout: 2_000 })
    .catch(() => undefined);
  return new URL(page.url()).pathname;
}

async function sendAndWait(page: Page, text: string) {
  await sendConciergeMessage(page, text);
  await waitForCopilotIdle(page, 120_000);
}

test.describe("SAN-1378 concierge thread lifecycle (/chat)", () => {
  test.skip(!enabled, "Set PROD_SMOKE_BASE_URL to the deployment under test");

  let identity: ThrowawayIdentity | undefined;

  test.beforeAll(() => {
    expect(hasE2eEnv(), "Supabase e2e credentials are required when a target is set").toBe(true);
  });

  test.afterAll(async () => {
    if (identity) await deleteThrowawayIdentity(identity);
  });

  test("New Chat starts a new persisted thread and a saved chat reopens with its history", async ({ page, browser }) => {
    test.setTimeout(360_000);
    identity = await createThrowawayIdentity("qa-san1378");
    if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
    await signInAsOnOrigin(page, baseUrl, identity.email);
    // Session injection clears cookies, so re-establish the same-origin bypass
    // (same order as the candidate certification spec).
    if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
    const runThreads = recordRunThreadIds(page);

    // ── Thread A ─────────────────────────────────────────────────────────────
    await gotoConcierge(page);
    const markerA = `${marker}-A-${randomUUID().slice(0, 8)}`;
    await sendAndWait(page, `Remember the word ${markerA}`);
    const threadA = runThreads.at(-1);
    expect(threadA, "a run for thread A was sent").toBeTruthy();
    await expect
      .poll(() => persistedMessagesContaining(threadA!, markerA), { timeout: 30_000 })
      .toBeGreaterThan(0);

    // ── New Chat ─────────────────────────────────────────────────────────────
    const afterNewChat = await pathAfterClick(page, () =>
      page.getByTestId("nav-new-chat").first().click(),
    );
    expect.soft(afterNewChat, "New Chat keeps Sofia on /chat").toBe("/chat");
    if (afterNewChat !== "/chat") {
      // Record the defect above, then continue from where a user would go back to.
      await gotoConcierge(page);
    }

    // A fresh chat starts empty: nothing of A is replayed into it.
    await expect(
      page.getByTestId("copilot-user-message"),
      "New Chat starts with no messages",
    ).toHaveCount(0);
    await expect(page.getByTestId("copilot-chat-region")).not.toContainText(markerA);

    const markerB = `${marker}-B-${randomUUID().slice(0, 8)}`;
    await sendAndWait(page, `New topic ${markerB}`);
    const threadB = runThreads.at(-1);
    expect(threadB, "a run for the new chat was sent").toBeTruthy();
    expect.soft(threadB, "New Chat runs on a different thread").not.toBe(threadA);
    await expect
      .poll(() => persistedMessagesContaining(threadB!, markerB), { timeout: 30_000 })
      .toBeGreaterThan(0);
    if (threadB !== threadA) {
      expect.soft(
        await persistedMessagesContaining(threadA!, markerB),
        "thread A never receives the new chat's message",
      ).toBe(0);
    }

    // ── Reopen saved thread A ────────────────────────────────────────────────
    await gotoConcierge(page);
    const savedA = page.locator(`[data-testid="nav-thread-item"][data-thread-id="${threadA}"]`).first();
    await expect(savedA, "thread A is listed in the rail").toBeVisible({ timeout: 30_000 });
    const afterOpen = await pathAfterClick(page, () => savedA.click());
    expect.soft(afterOpen, "opening a saved chat stays on /chat").toBe("/chat");
    await expect
      .soft(page.locator("nav[data-active-thread-id]").first(), "the rail marks thread A as the open chat")
      .toHaveAttribute("data-active-thread-id", threadA!);

    // SAN-1389: A's earlier messages are shown again — once, and not B's.
    const region = page.getByTestId("copilot-chat-region");
    await expect(page.getByTestId("saved-history-loading")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("saved-history-error")).toHaveCount(0);
    await expect
      .soft(
        region.getByTestId("copilot-user-message").filter({ hasText: markerA }),
        "A's earlier message is visible exactly once",
      )
      .toHaveCount(1, { timeout: 30_000 });
    await expect.soft(region, "B's message is not shown in A").not.toContainText(markerB);

    // Reopening A must continue A: the next run is on A and persists there.
    const markerC = `${marker}-C-${randomUUID().slice(0, 8)}`;
    await sendAndWait(page, `Back to the first topic ${markerC}`);
    expect.soft(runThreads.at(-1), "a reopened saved chat continues its own thread").toBe(threadA);
    await expect
      .poll(() => persistedMessagesContaining(threadA!, markerC), { timeout: 30_000 })
      .toBeGreaterThan(0);
    expect
      .soft(
        await persistedMessagesContaining(threadA!, markerC, "user"),
        "the follow-up is saved once in A",
      )
      .toBe(1);
    expect
      .soft(
        await persistedMessagesContaining(threadA!, markerA, "user"),
        "replaying history never re-saves A's earlier message",
      )
      .toBe(1);
    await expect
      .soft(
        region.getByTestId("copilot-user-message").filter({ hasText: markerA }),
        "A's earlier message is still shown exactly once after the follow-up",
      )
      .toHaveCount(1);
    expect(
      await persistedMessagesContaining(threadB!, markerC),
      "the reopened chat never writes into the newer thread",
    ).toBe(0);

    // Reopening never moves the new chat's message into A.
    expect(await persistedMessagesContaining(threadA!, markerB)).toBe(0);

    // ── Privacy: another user, and no user, cannot read A's history ──────────
    const historyUrl = new URL(`/api/threads/${threadA}/messages`, baseUrl).toString();
    const owner = await page.request.get(historyUrl);
    expect(owner.status(), "the owner can read her own history").toBe(200);
    const ownerBody = (await owner.json()) as { messages: Array<{ id: string; content: string }> };
    expect(JSON.stringify(ownerBody.messages)).toContain(markerA);
    const ids = ownerBody.messages.map((m) => m.id);
    expect(new Set(ids).size, "history has no duplicate ids").toBe(ids.length);

    const roberto = await createThrowawayIdentity("qa-san1389-other");
    const otherContext = await browser.newContext();
    try {
      const otherPage = await otherContext.newPage();
      if (isVercelPreview) await establishVercelAutomationBypass(otherPage, baseUrl, bypassSecret);
      await signInAsOnOrigin(otherPage, baseUrl, roberto.email);
      if (isVercelPreview) await establishVercelAutomationBypass(otherPage, baseUrl, bypassSecret);
      const refused = await otherPage.request.get(historyUrl);
      expect(refused.status(), "another signed-in user is refused").toBe(403);
      const refusedText = await refused.text();
      expect(refusedText).not.toContain(markerA);
      expect(refusedText).not.toContain(marker);

      const anonContext = await browser.newContext();
      try {
        const anonPage = await anonContext.newPage();
        if (isVercelPreview) await establishVercelAutomationBypass(anonPage, baseUrl, bypassSecret);
        const anon = await anonPage.request.get(historyUrl);
        expect(anon.status(), "an anonymous caller is refused").toBe(401);
        expect(await anon.text()).not.toContain(markerA);
      } finally {
        await anonContext.close();
      }
    } finally {
      await otherContext.close();
      await deleteThrowawayIdentity(roberto);
    }
  });

  test("New Chat while a reply is still streaming leaves the new chat clean", async ({ page }) => {
    test.setTimeout(300_000);
    // CopilotKit clears the view on a thread switch but does not stop an
    // in-flight run. Before the fix, the old answer kept streaming into the
    // new chat and was then saved into the new thread (SAN-1378 preview).
    const raceIdentity = await createThrowawayIdentity("qa-san1378-race");
    try {
      if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
      await signInAsOnOrigin(page, baseUrl, raceIdentity.email);
      if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
      const runThreads = recordRunThreadIds(page);
      await gotoConcierge(page);

      const markerA = `${marker}-STREAM-${randomUUID().slice(0, 6)}`;
      const streaming = page.waitForResponse(
        (r) => (r.request().postData() ?? "").includes('"agent/run"'),
        { timeout: 60_000 },
      );
      await sendConciergeMessage(
        page,
        `Write a detailed 400-word guide to Medellín neighborhoods for a remote worker. Start your answer with the word ${markerA}.`,
      );
      await streaming; // response headers are in: the reply is streaming now
      await page.getByTestId("nav-new-chat").first().click();
      const threadA = runThreads.at(-1)!;

      // Let the old run finish (or be stopped) server-side before asserting.
      await expect
        .poll(() => persistedMessagesContaining(threadA, markerA), { timeout: 60_000 })
        .toBeGreaterThan(0);
      await expect(page.getByTestId("copilot-chat-region")).not.toContainText(markerA);

      const before = await countConciergeReplies(page);
      const markerB = `${marker}-AFTER-${randomUUID().slice(0, 6)}`;
      await sendConciergeMessage(page, `Say only: ${markerB}`);
      await waitForConciergeReply(page, before);
      const threadB = runThreads.at(-1)!;
      expect(threadB, "New Chat runs on a different thread").not.toBe(threadA);
      await expect
        .poll(() => persistedMessagesContaining(threadB, markerB), { timeout: 60_000 })
        .toBeGreaterThan(0);
      expect(
        await persistedMessagesContaining(threadB, markerA),
        "the old streaming answer is never saved into the new chat",
      ).toBe(0);
    } finally {
      await deleteThrowawayIdentity(raceIdentity);
    }
  });
});
