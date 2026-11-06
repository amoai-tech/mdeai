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

  test.beforeAll(() => {
    expect(hasE2eEnv(), "Supabase e2e credentials are required when a target is set").toBe(true);
  });

  // Same journey, both sizes the acceptance asks for. Viewport is set per test so
  // one invocation covers desktop and mobile with identical steps and assertions.
  for (const [sizeLabel, viewport] of [
    ["desktop 1440", { width: 1440, height: 900 }],
    ["mobile 390", { width: 390, height: 844 }],
  ] as const) {
    test(`${sizeLabel}: a conversation survives leaving /chat and returning to it`, async ({ page }) => {
    await page.setViewportSize(viewport);
    test.setTimeout(420_000);
    // A per-test identity: `afterAll` runs once per worker, so a shared variable let
    // the second test overwrite the first one's identity and leak that QA account.
    let identity: ThrowawayIdentity | undefined;
    try {
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
    // True from a hard navigation until the next turn settles. An aborted session
    // bootstrap surfaces after load, so the in-flight flag alone cannot cover it.
    let postNavigation = false;
    const gotoPage = async (path: string) => {
      navigating = true;
      postNavigation = true;
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
      // A hard reload tears down the session bootstrap mid-request; the abort
      // surfaces after load, so the in-flight window above cannot catch it. Only
      // this exact cause is filtered — any other failed fetch is still reported.
      if (postNavigation && /Failed to fetch/i.test(text) && /_useSession/.test(text)) return;
      consoleErrors.push(text);
    });

    const runThreads = recordRunThreadIds(page);

    // ── 1. Ask on /chat ──────────────────────────────────────────────────────
    await gotoConcierge(page);
    const firstQuestion = `Remember the word ${marker}-A`;
    await sendAndWait(page, firstQuestion);
    const threadA = runThreads.at(-1);
    expect(threadA, "the first question ran on a thread").toBeTruthy();
    // Mastra persists on its own schedule, so poll rather than reading once: the
    // first read can beat the write and fail a healthy run.
    await expect
      .poll(() => persistedCount(threadA!), {
        timeout: 30_000,
        message: "the turn was persisted before leaving /chat",
      })
      .toBeGreaterThan(0);
    const persistedBefore = await persistedCount(threadA!);

    // ── 2. Leave for /rentals, then /events (full reloads) ───────────────────
    for (const path of ["/rentals", "/events"]) {
      await gotoPage(path);
      // A signed-out visitor is redirected to /login; that would be the failure.
      expect.soft(new URL(page.url()).pathname, `${path} did not bounce to login`).toBe(path);
    }

    // ── 3. Return to /chat and resume the same conversation ──────────────────
    await gotoConcierge(page);
    // This is also a hard load, so the session bootstrap is in-flight again.
    postNavigation = true;
    // On a 390px viewport the rail lives behind the navigation drawer; a real user
    // taps the trigger before they can see their conversations.
    const railTrigger = page.getByTestId("nav-drawer-trigger");
    if (await railTrigger.isVisible().catch(() => false)) {
      await railTrigger.click();
    }
    // Both rails can be in the DOM at once (the desktop rail is hidden at 390px, the
    // drawer copy is the visible one). Pick the VISIBLE instance, otherwise `.first()`
    // resolves to the hidden one and the assertion can never pass.
    const savedThread = page
      .locator(`[data-testid="nav-thread-item"][data-thread-id="${threadA}"]`)
      .filter({ visible: true })
      .first();
    await expect(savedThread, "the earlier conversation is listed in the rail").toBeVisible({
      timeout: 30_000,
    });

    const region = page.getByTestId("copilot-chat-region");
    await expect(page.getByTestId("saved-history-loading")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("saved-history-error")).toHaveCount(0);
    // The post-navigation bootstrap window is over once history has settled; the
    // follow-up turn must not inherit it, or a real session-fetch failure there
    // would be filtered out.
    postNavigation = false;
    // Shown again exactly once — a duplicate would mean the history replayed twice.
    await expect
      .soft(
        region.getByTestId("copilot-user-message").filter({ hasText: `${marker}-A` }),
        "the earlier question is shown exactly once after returning",
      )
      .toHaveCount(1, { timeout: 30_000 });

    // The rail may legitimately keep no active id here: this conversation is the
    // tab's own session thread, so it is already displayed. What must never happen
    // is a DIFFERENT thread being marked active.
    const railActive = await page.locator("nav[data-active-thread-id]").first()
      .getAttribute("data-active-thread-id");
    expect
      .soft(
        !railActive || railActive === threadA,
        `no other conversation is marked active (rail showed ${railActive ?? "none"})`,
      )
      .toBe(true);

    // SAN-1639: clicking the conversation that is already open used to clear the
    // transcript for a few seconds and then reload it. A `toHaveCount(1)` retry can
    // pass either side of that dip, so it cannot see the bug. Sample continuously
    // with a MutationObserver and assert the LOWEST count observed never fell.
    await page.evaluate(() => {
      const win = window as unknown as {
        __minChatCount: number;
        __chatObserver?: MutationObserver;
        __quietSince?: number;
      };
      const selector = '[data-testid="copilot-user-message"]';
      win.__minChatCount = document.querySelectorAll(selector).length;
      win.__chatObserver?.disconnect();
      win.__chatObserver = new MutationObserver(() => {
        const n = document.querySelectorAll(selector).length;
        if (n < win.__minChatCount) win.__minChatCount = n;
      });
      // `copilot-chat-region` lives inside `<div key={sessionKey}>` in
      // chat-center-panel, so a session reset remounts and detaches it — an
      // observer on that node would silently stop watching exactly when the
      // transcript is cleared. Watch the stable panel and count globally.
      win.__chatObserver.observe(
        document.querySelector('[data-testid="center-chat-panel"]') ?? document.body,
        { childList: true, subtree: true, characterData: true },
      );
    });

    await savedThread.click();

    // Settle signal rather than a timeout: the region is quiet once no history
    // restore is running, observed for a continuous second.
    await page.waitForFunction(() => {
      const win = window as unknown as { __quietSince?: number };
      if (document.querySelector('[data-testid="saved-history-loading"]')) {
        win.__quietSince = undefined;
        return false;
      }
      win.__quietSince ??= Date.now();
      return Date.now() - win.__quietSince > 1_000;
    }, undefined, { timeout: 30_000 });

    const minChatCount = await page.evaluate(
      () => (window as unknown as { __minChatCount: number }).__minChatCount,
    );
    expect
      .soft(minChatCount, "re-clicking the open conversation never emptied the transcript")
      .toBeGreaterThanOrEqual(1);

    // And it is still there once things settle.
    await expect
      .soft(
        region.getByTestId("copilot-user-message").filter({ hasText: `${marker}-A` }),
        "re-clicking the open conversation keeps its history",
      )
      .toHaveCount(1, { timeout: 30_000 });

    // ── 4. Continue the conversation, on the same thread ─────────────────────
    const followUp = `And the second word ${marker}-B`;
    await sendAndWait(page, followUp);
    expect.soft(runThreads.at(-1), "the follow-up continues thread A").toBe(threadA);
    // Mastra writes on its own schedule, so poll instead of reading once: a single
    // read can catch the database before the turn lands and fail a good run.
    await expect
      .poll(() => persistedCount(threadA!), {
        timeout: 30_000,
        message: "the follow-up persisted on thread A",
      })
      .toBeGreaterThan(persistedBefore);

    expect.soft(consoleErrors, "no unexpected console errors across the journey").toEqual([]);
    } finally {
      if (identity) await deleteThrowawayIdentity(identity);
    }
    });
  }
});
