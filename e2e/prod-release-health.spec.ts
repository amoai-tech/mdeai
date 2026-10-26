import { test, expect } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
} from "./helpers/auth";
import { sendHostChatMessage } from "./helpers/host-chat";

/**
 * Post-deploy release health check.
 *
 * Opt-in only: `PROD_RELEASE_HEALTH=1`. It creates a disposable organizer, asks
 * the real host agent one question, proves a reply and a persisted Mastra
 * thread, then deletes the identity and its threads.
 */
test.use({
  launchOptions: process.env.MDE_E2E_CHROME_PATH
    ? { executablePath: process.env.MDE_E2E_CHROME_PATH }
    : {},
});
test.describe.configure({ timeout: 240_000 });
test.skip(!hasE2eEnv(), "Supabase e2e env is not configured");
test.skip(
  process.env.PROD_RELEASE_HEALTH !== "1",
  "Set PROD_RELEASE_HEALTH=1 to run the post-deploy health check",
);

test("production host agent replies and persists a thread", async ({ page, baseURL }) => {
  const origin = baseURL ?? "https://www.mdeai.co";
  const identity = await createThrowawayIdentity("prod-release-health");
  const admin = await getSupabaseAdmin();
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });

  try {
    await signInAsOnOrigin(page, origin, identity.email);
    await page.goto(`${origin}/app/events`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("host-os-chat-region")).toBeVisible({
      timeout: 60_000,
    });

    const wait = await sendHostChatMessage(
      page,
      "Reply with one short sentence confirming you can see my events.",
    );
    await wait();
    // CopilotKit can mount the assistant bubble before its first text delta.
    const replies = page
      .getByTestId("host-os-chat-region")
      .getByTestId("copilot-assistant-message");
    await expect
      .poll(async () => (await replies.last().innerText()).trim().length, {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    const reply = (await replies.last().innerText()).trim();
    expect(reply.length).toBeGreaterThan(0);
    expect(consoleErrors.join("\n")).not.toContain(
      "password authentication failed",
    );

    const threads = await admin
      .from("mastra_threads")
      .select("id", { count: "exact", head: true })
      .eq("resourceId", identity.userId);
    expect(threads.error, threads.error?.message).toBeNull();
    expect(threads.count).toBeGreaterThan(0);
  } finally {
    await deleteThrowawayIdentity(identity);
  }
});
