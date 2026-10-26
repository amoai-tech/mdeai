import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  getTestSession,
  hasE2eEnv,
  injectSession,
  type ThrowawayIdentity,
} from "../helpers/auth";

/**
 * SAN-1209 — opt-in live proof: one real Host Ops turn, durable readback,
 * client navigation, hard refresh, and foreign/anonymous thread denial.
 * Throwaway identities and messages are deleted and verified by the shared helper.
 * Do not publish authenticated screenshots, traces or session cookies.
 */
test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
  trace: "off", screenshot: "off", video: "off",
});

const base = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
test.skip(!base, "Opt in with PROD_SMOKE_BASE_URL and PW_SKIP_WEBSERVER=1");

test("SAN-1209: Host conversation restores after reload and rejects foreign users", async ({ browser }) => {
  test.setTimeout(240_000);
  if (!hasE2eEnv()) throw new Error("Missing real Supabase QA credentials");
  const origin = new URL(base);
  const admin = await getSupabaseAdmin();
  let owner: ThrowawayIdentity | undefined;
  let foreign: ThrowawayIdentity | undefined;
  const one = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const two = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await one.newPage();
  const otherPage = await two.newPage();
  const marker = `san1209-qa-${randomUUID().slice(0, 12)}`;
  const agentThreads: string[] = [];

  page.on("request", (req) => {
    if (!req.url().includes("/api/copilotkit") || req.method() !== "POST") return;
    try {
      const payload = JSON.parse(req.postData() ?? "{}");
      if (payload.params?.agentId === "hostOpsAgent" && payload.body?.threadId) {
        agentThreads.push(payload.body.threadId);
      }
    } catch { /* malformed body is validated by the server */ }
  });

  try {
    owner = await createThrowawayIdentity("san1209-owner");
    foreign = await createThrowawayIdentity("san1209-foreign");
    const session = await getTestSession(owner.email);
    await injectSession(one, session, {
      host: origin.hostname, secure: origin.protocol === "https:",
    });
    await page.goto(new URL("/app/events",base).toString(), { waitUntil: "domcontentloaded" });
    const rail = page.getByTestId("host-os-chat-region");
    await expect(rail).toBeVisible({ timeout: 45_000 });
    const editor = rail.locator("textarea").first();
    await expect(editor).toBeVisible();
    // Wait for CopilotKit's asynchronous runtime discovery, not merely SSR HTML.
    await expect.poll(async () => {
      const res = await page.request.post(new URL("/api/copilotkit",base).toString(), {
        data: { method: "info" },
      });
      return res.status();
    }, { timeout: 30_000 }).toBe(200);
    const prompt = `SAN-1209 test: reply OK, without creating an event. Ref ${marker}`;
    // SSR can display the textarea before CopilotKit hydrates. Retry typing
    // until the real React composer enables Send; a visible textarea alone
    // does not prove the client input handler is mounted.
    const sendButton = rail.getByTestId("copilot-send-button");
    await expect(async () => {
      await editor.fill("");
      await editor.pressSequentially(prompt, { delay: 8 });
      await expect(editor).toHaveValue(prompt);
      await expect(sendButton).toBeEnabled({ timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    const response = page.waitForResponse((res) =>
      res.url().includes("/api/copilotkit") &&
      res.request().method() === "POST" &&
      res.request().postDataJSON()?.method === "agent/run",
    { timeout: 50_000 });
    await editor.press("Enter");
    expect((await response).status()).toBe(200);

    let durableId = "";
    await expect.poll(async () => {
      const { data, error } = await admin.from("mastra_threads")
        .select("id").eq("resourceId", owner!.userId);
      if (error) throw error;
      durableId = data?.[0]?.id ?? "";
      return data?.length ?? 0;
    }, { timeout: 90_000, intervals: [1000, 2500, 5000] }).toBe(1);
    await expect.poll(async () => {
      const { count, error } = await admin.from("mastra_messages")
        .select("id", { count: "exact", head: true }).eq("thread_id", durableId);
      if (error) throw error;
      return count ?? 0;
    }, { timeout: 90_000, intervals: [2000, 3000, 5000] }).toBeGreaterThanOrEqual(2);

    expect(agentThreads).toContain(durableId);
    await expect(rail).toContainText(marker, { timeout: 25_000 });
    const nav = page.locator('a[href="/app/events/overview"]').first();
    await nav.click();
    await expect(page).toHaveURL(/\/app\/events\/overview/);
    await expect(page.getByTestId("host-os-chat-region")).toContainText(marker, { timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("host-os-chat-region")).toContainText(marker, { timeout: 45_000 });

    // The transcript must be readable on a real 390px phone, not merely in
    // the DOM underneath the persistent composer or placeholder inbox.
    const restoredRail = page.getByTestId("host-os-chat-region");
    const restoredMessage = restoredRail.getByText(new RegExp(marker)).first();
    await restoredMessage.scrollIntoViewIfNeeded();
    await expect(restoredMessage).toBeVisible();
    const messageRect = await restoredMessage.boundingBox();
    const composerRect = await restoredRail.locator("textarea").first().boundingBox();
    expect(messageRect).not.toBeNull();
    expect(composerRect).not.toBeNull();
    expect(messageRect!.y + messageRect!.height)
      .toBeLessThanOrEqual(composerRect!.y - 4);
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    )).toBe(false);

    // Once the restored provider reconnects, it must select the original thread.
    await expect.poll(() => agentThreads.filter((t) => t === durableId).length, {
      timeout: 25_000, intervals: [500, 1000],
    }).toBeGreaterThanOrEqual(2);
    expect(agentThreads.every((id) => id === durableId)).toBe(true);

    const foreignSession = await getTestSession(foreign.email);
    await injectSession(two, foreignSession, {
      host: origin.hostname, secure: origin.protocol === "https:",
    });
    const body = {
      method: "agent/connect",
      params: { agentId: "hostOpsAgent" },
      body: { threadId: durableId, runId: randomUUID(), messages: [], tools: [], context: [] },
    };
    const foreignResponse = await otherPage.request.post(new URL("/api/copilotkit",base).toString(), {
      data: body, maxRedirects: 0,
    });
    const anon = await browser.newContext();
    const anonymousResponse = await anon.request.post(new URL("/api/copilotkit",base).toString(), {
      data: body, maxRedirects: 0,
    });
    await anon.close();
    expect(foreignResponse.status()).toBe(403);
    expect(anonymousResponse.status()).toBe(401);
    console.log("SAN1209_PROOF " + JSON.stringify({
      threadRestored: true, persistedMessagesAtLeast: 2,
      ownerThreadReused: true, foreignStatus: 403, anonymousStatus: 401,
      viewportWidth: 390,
    }));
  } finally {
    await one.close();
    await two.close();
    if (owner) await deleteThrowawayIdentity(owner);
    if (foreign) await deleteThrowawayIdentity(foreign);
  }
});
