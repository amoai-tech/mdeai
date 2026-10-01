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

/**
 * SAN-1378 · Stage D — concierge thread lifecycle on the real /chat surface.
 *
 * Proves the two promises the nav rail makes, end to end, and checks the
 * database rather than the screen. A UI can show a fresh, empty chat while a
 * backend path keeps writing to the old thread, so every claim here is backed
 * by `mastra_messages` rows:
 *
 *   1. New Chat — Sofia stays on /chat, her next message runs on a NEW thread
 *      B ≠ A, B persists it, and A never receives it.
 *   2. Saved chat — clicking thread A in the rail stays on /chat and the next
 *      message continues A (persisted in A, never in B). Showing A's earlier
 *      messages is a separate, pending capability: see the `fixme` below.
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
async function persistedMessagesContaining(threadId: string, text: string): Promise<number> {
  const admin = await getSupabaseAdmin();
  const { count, error } = await admin
    .from("mastra_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .ilike("content", `%${text}%`);
  if (error) throw new Error(`mastra_messages read failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Click and report the pathname the page settles on. A client-side `router.push`
 * does not fire a load event, so wait up to 5s for any navigation away from
 * /chat before reading the URL; reading it immediately races the navigation.
 */
async function pathAfterClick(page: Page, click: () => Promise<void>): Promise<string> {
  await click();
  await page
    .waitForURL((url) => url.pathname !== "/chat", { timeout: 5_000 })
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

  test("New Chat starts a new persisted thread and a saved chat reopens", async ({ page }) => {
    test.setTimeout(360_000);
    identity = await createThrowawayIdentity("qa-san1378");
    await signInAsOnOrigin(page, baseUrl, identity.email);
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

    // Reopening A must continue A: the next run is on A and persists there.
    const markerC = `${marker}-C-${randomUUID().slice(0, 8)}`;
    await sendAndWait(page, `Back to the first topic ${markerC}`);
    expect.soft(runThreads.at(-1), "a reopened saved chat continues its own thread").toBe(threadA);
    await expect
      .poll(() => persistedMessagesContaining(threadA!, markerC), { timeout: 30_000 })
      .toBeGreaterThan(0);
    expect(
      await persistedMessagesContaining(threadB!, markerC),
      "the reopened chat never writes into the newer thread",
    ).toBe(0);

    // Reopening never moves the new chat's message into A.
    expect(await persistedMessagesContaining(threadA!, markerB)).toBe(0);
  });

  // Showing A's earlier messages on reopen needs a history loader MDE does not
  // have: `@ag-ui/mastra`'s MastraAgent implements `run` but not `connect`, so
  // CopilotKit can only replay runs still held in the current server process.
  // Tracked as a follow-up to SAN-1378; this marks the gap instead of hiding it.
  test.fixme("a reopened saved chat shows its earlier messages", async () => {});
});
