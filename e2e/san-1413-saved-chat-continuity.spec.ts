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
import { gotoConcierge } from "./helpers/maps-layout";

/**
 * SAN-1413 / SAN-1088 · a signed-in saved conversation survives
 * Chat → Rentals → Events → Chat, refresh, browser Back/Forward and tab switches
 * — proven against real persisted messages, not a mocked store.
 *
 * The rows are seeded directly into the existing Mastra tables (the same
 * production storage the app uses) so the proof is deterministic and does not
 * depend on a model turn. Every identity and row is removed afterwards.
 *
 * Also proves private-data isolation: another signed-in user and an anonymous
 * caller are refused the owner's history, and no owner content appears in the
 * refusal body.
 *
 * Runs only when PROD_SMOKE_BASE_URL targets a deployment with the Supabase e2e
 * env present; it fails loudly rather than skipping to green when a target is
 * set without credentials.
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const enabled = Boolean(baseUrl);

type SeededChat = { threadId: string; marker: string; message: string };

function stamp(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().replace("Z", "");
}

/** Seed a saved conversation for a user into the existing Mastra storage. */
async function seedChat(userId: string, label: string, text: string): Promise<SeededChat> {
  const admin = await getSupabaseAdmin();
  const threadId = randomUUID();
  const now = stamp();
  const inserted = await admin.from("mastra_threads").insert({
    id: threadId,
    resourceId: userId,
    title: `${label} ${text}`,
    createdAt: now,
    updatedAt: now,
  });
  if (inserted.error) throw new Error(`seed thread: ${inserted.error.message}`);
  const rows = [
    { role: "user", text, at: now },
    { role: "assistant", text: `Answer about ${text}`, at: stamp(1_000) },
  ].map((row) => ({
    id: randomUUID(),
    thread_id: threadId,
    resourceId: userId,
    role: row.role,
    type: "v2",
    createdAt: row.at,
    content: JSON.stringify({ format: 2, parts: [{ type: "text", text: row.text }] }),
  }));
  const saved = await admin.from("mastra_messages").insert(rows);
  if (saved.error) throw new Error(`seed messages: ${saved.error.message}`);
  return { threadId, marker: text, message: text };
}

function rail(page: Page) {
  return page.locator("nav[data-active-thread-id]").first();
}

async function openSaved(page: Page, threadId: string) {
  const item = page.locator(`[data-testid="nav-thread-item"][data-thread-id="${threadId}"]`).first();
  await expect(item, "the saved chat is listed in the rail").toBeVisible({ timeout: 30_000 });
  await item.click();
  await expect(rail(page), "the clicked chat becomes the active conversation").toHaveAttribute(
    "data-active-thread-id", threadId, { timeout: 20_000 });
  await expect(page.getByTestId("saved-history-loading")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("saved-history-error")).toHaveCount(0);
}

async function markerCount(page: Page, marker: string): Promise<number> {
  return page.getByTestId("copilot-chat-region").getByTestId("copilot-user-message").filter({ hasText: marker }).count();
}

async function expectOnlyThisChat(page: Page, shown: SeededChat, hidden?: SeededChat) {
  await expect
    .poll(() => markerCount(page, shown.marker), { timeout: 30_000, message: "the restored message is shown" })
    .toBe(1);
  if (hidden) {
    await expect(page.getByTestId("copilot-chat-region")).not.toContainText(hidden.marker);
  }
}

test.describe("SAN-1413 saved chat continuity on a real signed-in deployment", () => {
  test.skip(!enabled, "Set PROD_SMOKE_BASE_URL to the deployment under test");

  let sofia: ThrowawayIdentity | undefined;
  let camila: ThrowawayIdentity | undefined;

  test.beforeAll(() => {
    expect(hasE2eEnv(), "Supabase e2e credentials are required when a target is set").toBe(true);
  });

  test.afterAll(async () => {
    if (sofia) await deleteThrowawayIdentity(sofia);
    if (camila) await deleteThrowawayIdentity(camila);
  });

  test("the selected saved chat survives Chat → Rentals → Events → Chat, refresh and Back/Forward", async ({ page, browser }) => {
    test.setTimeout(300_000);
    sofia = await createThrowawayIdentity("qa-san1413");
    const chatA = await seedChat(sofia.userId, "Laureles apartment", `san1413-a-${randomUUID().slice(0, 8)}`);
    const chatB = await seedChat(sofia.userId, "Cafés in Poblado", `san1413-b-${randomUUID().slice(0, 8)}`);

    // The existing Mastra placeholder and metadata must be repaired without
    // replacing the original thread, leaking content or erasing metadata.
    const admin = await getSupabaseAdmin();
    const seededMetadata = { qaThreadPurpose: "title-repair-preserve-metadata" };
    const placeholder = await admin.from("mastra_threads")
      .update({ title: "Untitled Thread", metadata: seededMetadata })
      .eq("id", chatA.threadId);
    if (placeholder.error) throw new Error("seed placeholder: " + placeholder.error.message);

    await signInAsOnOrigin(page, baseUrl, sofia.email);
    await gotoConcierge(page);

    // ── Open saved chat A ────────────────────────────────────────────────────
    await openSaved(page, chatA.threadId);
    await expectOnlyThisChat(page, chatA, chatB);

    await expect.poll(async () => {
      const read = await admin.from("mastra_threads")
        .select("title, metadata").eq("id", chatA.threadId).single();
      if (read.error) throw new Error("read saved title: " + read.error.message);
      return read.data?.title;
    }, { timeout: 30_000, message: "the saved chat gets its persisted title" })
      .toBe(chatA.marker);
    const titled = await admin.from("mastra_threads")
      .select("metadata").eq("id", chatA.threadId).single();
    expect(titled.error).toBeNull();
    expect(titled.data?.metadata).toEqual(seededMetadata);

    // ── Chat → Rentals → Events → Chat (same tab, actual in-app links) ──────
    await page.getByTestId("nav-rentals-link").first().click();
    await page.waitForURL("**/rentals", { timeout: 30_000 });
    await expect(page.getByTestId("rentals-browse")).toBeVisible();
    // The SAN-1421 inline composer is not yet present on main; testing that
    // send/reply handoff requires its owning task to finish the UI separately.
    // This test proves that navigating the existing discovery workspaces does
    // not change the selected conversation, without claiming composer parity.
    await page.getByTestId("nav-events-link").first().click();
    await page.waitForURL("**/events", { timeout: 30_000 });
    await expect(page.getByTestId("events-browse")).toBeVisible();
    await page.getByRole("link", { name: "Ask concierge", exact: true }).click();
    await page.waitForURL("**/chat", { timeout: 30_000 });
    // Browser navigation preserves identity even after both route providers
    // have unmounted and the /chat provider must reconnect and replay A.
    await page.goBack();
    await expect(page.getByTestId("events-browse")).toBeVisible();
    await page.goForward();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 20_000, message: "Forward returns to Chat" })
      .toBe("/chat");
    await expect(rail(page), "returning keeps the same conversation").toHaveAttribute(
      "data-active-thread-id", chatA.threadId, { timeout: 20_000 });
    await expect(page.getByTestId("saved-history-loading")).toHaveCount(0, { timeout: 30_000 });
    await expectOnlyThisChat(page, chatA, chatB);

    // ── Refresh ──────────────────────────────────────────────────────────────
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(rail(page), "refresh reopens the same saved conversation").toHaveAttribute(
      "data-active-thread-id", chatA.threadId, { timeout: 30_000 });
    await expect(page.getByTestId("saved-history-loading")).toHaveCount(0, { timeout: 30_000 });
    await expectOnlyThisChat(page, chatA, chatB);

    // Separate browser tabs share sign-in, not conversation selection.
    const otherTab = await page.context().newPage();
    try {
      await otherTab.goto(new URL("/chat", baseUrl).toString(), { waitUntil: "domcontentloaded" });
      await openSaved(otherTab, chatB.threadId);
      await expectOnlyThisChat(otherTab, chatB, chatA);
      await expect(rail(page), "the original tab still has A selected")
        .toHaveAttribute("data-active-thread-id", chatA.threadId);
      await expectOnlyThisChat(page, chatA, chatB);
    } finally {
      await otherTab.close();
    }

    // ── A → B → Back → Forward ───────────────────────────────────────────────
    await openSaved(page, chatB.threadId);
    await expectOnlyThisChat(page, chatB, chatA);
    await page.goBack();
    await expect(rail(page), "Back restores the previously opened chat").toHaveAttribute(
      "data-active-thread-id", chatA.threadId, { timeout: 20_000 });
    await expect(page.getByTestId("saved-history-loading")).toHaveCount(0, { timeout: 30_000 });
    await expectOnlyThisChat(page, chatA, chatB);
    await page.goForward();
    await expect(rail(page), "Forward returns to the chat opened after it").toHaveAttribute(
      "data-active-thread-id", chatB.threadId, { timeout: 20_000 });
    await expect(page.getByTestId("saved-history-loading")).toHaveCount(0, { timeout: 30_000 });
    await expectOnlyThisChat(page, chatB, chatA);

    // ── Isolation: the owner may read A; nobody else may ─────────────────────
    const historyUrl = new URL(`/api/threads/${chatA.threadId}/messages`, baseUrl).toString();
    const owner = await page.request.get(historyUrl);
    expect(owner.status(), "the owner can read her own history").toBe(200);
    expect(await owner.text()).toContain(chatA.marker);

    camila = await createThrowawayIdentity("qa-san1413-other");
    const otherContext = await browser.newContext();
    try {
      const otherPage = await otherContext.newPage();
      await signInAsOnOrigin(otherPage, baseUrl, camila.email);
      const refused = await otherPage.request.get(historyUrl);
      expect(refused.status(), "another signed-in user is refused").toBe(403);
      const body = await refused.text();
      expect(body, "the refusal never contains the owner's message").not.toContain(chatA.marker);
    } finally {
      await otherContext.close();
    }

    const anonContext = await browser.newContext();
    try {
      const anonPage = await anonContext.newPage();
      const anon = await anonPage.request.get(historyUrl);
      expect(anon.status(), "an anonymous caller is refused").toBe(401);
      expect(await anon.text()).not.toContain(chatA.marker);
    } finally {
      await anonContext.close();
    }

    // ── Sign out: authenticated history must stop being accessible ───────────
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(signOut, "the authenticated chat exposes a sign-out action").toBeVisible();
    await signOut.click();
    await expect(page, "sign-out returns the visitor home").toHaveURL(
      new URL("/", baseUrl).toString(),
      { timeout: 20_000 },
    );
    const afterSignOut = await page.request.get(historyUrl);
    expect(afterSignOut.status(), "the former owner no longer has an authenticated session").toBe(401);
    expect(await afterSignOut.text()).not.toContain(chatA.marker);
  });
});
