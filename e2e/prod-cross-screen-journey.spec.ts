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
  gotoConcierge,
  sendConciergeMessage,
  waitForCopilotIdle,
} from "./helpers/maps-layout";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";

/**
 * SAN-1298 · one continuous cross-screen conversation on the real application.
 *
 * The epic's remaining claim: a signed-in person asks MDE something on `/chat`,
 * wanders to `/rentals` and `/events`, then comes back and finds **the same
 * conversation** — history shown once, and the next question continuing the
 * same thread rather than silently starting a new one.
 *
 * Every other suite proves a single surface. `prod-signed-in-route` proves login
 * and routes; the lifecycle spec proves New Chat / saved-chat behaviour without
 * leaving `/chat`. Neither carries a conversation across pages, which is the gap
 * this covers.
 *
 * Deliberate choices:
 * - Real full-page navigations (`page.goto`), not client-side routing. A reload
 *   is what tests whether the *session* survives, not just the React tree.
 * - The thread is identified from the actual `agent/run` envelope the browser
 *   sends, and confirmed against `mastra_messages` rows — not from the URL.
 * - Reopening uses the rail's own saved-chat item, because landing on `/chat`
 *   after a navigation is allowed to show a fresh thread; resuming is the
 *   user-visible behaviour under test.
 *
 * Runs only with PROD_SMOKE_BASE_URL and the Supabase e2e env, and fails loudly
 * rather than skipping to green when a target is set without credentials.
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";

/**
 * This journey signs in and renders a real conversation, so a failure screenshot,
 * trace or video would capture private chat content. Artifacts stay off by default
 * here rather than inheriting `only-on-failure` from the project.
 */
test.use({ screenshot: "off", trace: "off", video: "off" });
/** Writes a throwaway identity and real chat rows, so it needs its own opt-in. */
const optIn = process.env.MDE_SAN1298_CROSS_SCREEN === "1";
const enabled = Boolean(baseUrl) && optIn;
const marker = `san1298-${Date.now().toString(36)}`;
const isVercelPreview = /\.vercel\.app$/i.test(baseUrl ? new URL(baseUrl).hostname : "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";

/** Thread ids of every `agent/run` envelope the browser sends, in order. */
function recordRunThreadIds(page: Page): string[] {
  const ids: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (!new URL(request.url()).pathname.startsWith("/api/copilotkit")) return;
    try {
      const envelope = request.postDataJSON() as { body?: { threadId?: string } } | null;
      const threadId = envelope?.body?.threadId;
      if (threadId) ids.push(threadId);
    } catch {
      // A body that is not JSON cannot be an agent/run envelope.
    }
  });
  return ids;
}

async function persistedCount(threadId: string): Promise<number> {
  const admin = await getSupabaseAdmin();
  const { count, error } = await admin
    .from("mastra_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  if (error) throw new Error(`mastra_messages read failed: ${error.message}`);
  return count ?? 0;
}

async function sendAndWait(page: Page, text: string) {
  await sendConciergeMessage(page, text);
  await waitForCopilotIdle(page, 120_000);
}

test.describe("SAN-1298 cross-screen conversation (/chat → /rentals → /events → /chat)", () => {
  test.skip(
    !enabled,
    "Opt-in only: set PROD_SMOKE_BASE_URL and MDE_SAN1298_CROSS_SCREEN=1 (writes a QA identity and chat rows)",
  );

  let identity: ThrowawayIdentity | undefined;

  test.beforeAll(() => {
    expect(hasE2eEnv(), "Supabase e2e credentials are required when a target is set").toBe(true);
  });

  test.afterAll(async () => {
    if (identity) await deleteThrowawayIdentity(identity);
  });

  test("a conversation survives leaving /chat and returning to it", async ({ page }) => {
    test.setTimeout(420_000);
    identity = await createThrowawayIdentity("qa-san1298");
    if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
    await signInAsOnOrigin(page, baseUrl, identity.email);
    if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);

    // Console errors are evidence. Two kinds are expected noise and are filtered
    // by cause, not by time (fixed sleeps are forbidden here by
    // `playwright-architecture-contract`):
    //  - the Maps raster fallback, and
    //  - "Failed to fetch" for a request a full-page navigation aborted mid-flight.
    // The second is gated on a navigation actually being in flight, so a genuine
    // failed request while a page sits still is still reported.
    let navigating = false;
    const gotoPage = async (path: string) => {
      navigating = true;
      try {
        return await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
      } finally {
        navigating = false;
      }
    };
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/Vector Map.*Falling back to Raster/i.test(text)) return;
      if (navigating && /Failed to fetch/i.test(text)) return;
      consoleErrors.push(text);
    });

    const runThreads = recordRunThreadIds(page);

    // ── 1. Ask on /chat ──────────────────────────────────────────────────────
    await gotoConcierge(page);
    const firstQuestion = `Remember the word ${marker}-A`;
    await sendAndWait(page, firstQuestion);
    const threadA = runThreads.at(-1);
    expect(threadA, "the first question ran on a thread").toBeTruthy();
    const persistedBefore = await persistedCount(threadA!);
    expect(persistedBefore, "the turn was persisted before leaving /chat").toBeGreaterThan(0);

    // ── 2. Leave for /rentals, then /events (full reloads) ───────────────────
    for (const path of ["/rentals", "/events"]) {
      await gotoPage(path);
      // A signed-out visitor is redirected to /login; that would be the failure.
      expect.soft(new URL(page.url()).pathname, `${path} did not bounce to login`).toBe(path);
    }

    // ── 3. Return to /chat and resume the same conversation ──────────────────
    await gotoConcierge(page);
    const savedThread = page.locator(`[data-testid="nav-thread-item"][data-thread-id="${threadA}"]`).first();
    await expect(savedThread, "the earlier conversation is listed in the rail").toBeVisible({
      timeout: 30_000,
    });

    // The app is expected to reattach thread A on return. Click the rail item ONLY
    // when it is not already the active chat: re-clicking the active thread clears
    // the visible transcript for several seconds (observed on 6c4fb2fd0a), which is
    // a separate behaviour and not what this journey is proving.
    const railActive = await page.locator("nav[data-active-thread-id]").first()
      .getAttribute("data-active-thread-id");
    if (railActive !== threadA) {
      await savedThread.click();
    }
    await expect
      .soft(page.locator("nav[data-active-thread-id]").first(), "the reopened chat is thread A")
      .toHaveAttribute("data-active-thread-id", threadA!, { timeout: 30_000 });

    const region = page.getByTestId("copilot-chat-region");
    await expect(page.getByTestId("saved-history-loading")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("saved-history-error")).toHaveCount(0);
    // Shown again exactly once — a duplicate would mean the history replayed twice.
    await expect
      .soft(
        region.getByTestId("copilot-user-message").filter({ hasText: `${marker}-A` }),
        "the earlier question is shown exactly once after returning",
      )
      .toHaveCount(1, { timeout: 30_000 });

    // ── 4. Continue the conversation, on the same thread ─────────────────────
    const followUp = `And the second word ${marker}-B`;
    await sendAndWait(page, followUp);
    expect.soft(runThreads.at(-1), "the follow-up continues thread A").toBe(threadA);
    const persistedAfter = await persistedCount(threadA!);
    expect
      .soft(persistedAfter, "the follow-up persisted on thread A")
      .toBeGreaterThan(persistedBefore);

    expect.soft(consoleErrors, "no unexpected console errors across the journey").toEqual([]);
  });
});
