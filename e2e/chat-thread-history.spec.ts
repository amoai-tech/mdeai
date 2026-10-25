import { expect, test, type Page } from "@playwright/test";

import { gotoDeterministicChat } from "./helpers/deterministic-chat";

/**
 * SAN-1413 · the selected saved chat survives refresh and Back/Forward.
 *
 * This is the browser-level proof that the per-tab conversation selection is
 * real, not just unit state. It is deterministic: the thread list is mocked,
 * and the deterministic chat never starts a live transport.

 * It also protects the specific regression that unit tests cannot see: clicking
 * a chat in the rail used to `router.push("/chat")` while already on /chat, and
 * the App Router rewrote that history entry, discarding the selection. One Back
 * press then appeared to do nothing.
 */

const CHAT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function mockSavedChats(page: Page) {
  await page.route("**/api/threads", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        threads: [
          { id: CHAT_A, title: "Chat A", updatedAt: new Date().toISOString() },
          { id: CHAT_B, title: "Chat B", updatedAt: new Date().toISOString() },
        ],
      }),
    }));
  await page.route("**/api/threads/*/messages", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [] }) }));
}

function rail(page: Page) {
  return page.locator("nav[data-active-thread-id]").first();
}

function threadItem(page: Page, id: string) {
  return page.locator(`[data-testid="nav-thread-item"][data-thread-id="${id}"]`).first();
}

test.describe("SAN-1413 the selected saved chat survives refresh and Back/Forward", { tag: ["@critical", "@deterministic"] }, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockSavedChats(page);
  });

  test("A then B, Back restores A, Forward returns to B", async ({ page }) => {
    // Cold Next.js compilation can consume most of the default 60s budget in CI.
    // Keep the history assertions strict; only allow the same startup budget as
    // the sibling refresh/navigation journey.
    test.setTimeout(100_000);
    await gotoDeterministicChat(page);
    const nav = rail(page);

    await expect(threadItem(page, CHAT_A), "the mocked saved-chat list loads before selection")
      .toBeVisible({ timeout: 15_000 });
    await threadItem(page, CHAT_A).click();
    await expect(nav).toHaveAttribute("data-active-thread-id", CHAT_A);
    await threadItem(page, CHAT_B).click();
    await expect(nav).toHaveAttribute("data-active-thread-id", CHAT_B);

    // The selection uses history.pushState on the SAME /chat document.
    // Playwright page.goBack() defaults to waiting for a full page "load", which
    // never fires for a same-document popstate and timed out in CI (#507).
    // Drive native Back/Forward and wait for the observable thread selection.
    await page.evaluate(() => window.history.back());
    await expect(nav, "one Back press restores the previous saved chat").toHaveAttribute(
      "data-active-thread-id", CHAT_A, { timeout: 15_000 });

    await page.evaluate(() => window.history.forward());
    await expect(nav, "Forward returns to the chat that was open after it").toHaveAttribute(
      "data-active-thread-id", CHAT_B, { timeout: 15_000 });
  });

  test("refresh, leaving to Rentals and re-entering /chat keep the same saved chat", async ({ page }) => {
    // The first /rentals server component cold-compiles and handles the deliberately
    // unavailable database in PR CI. Allow that route budget without raising the
    // timeout for unrelated navigation and history tests.
    test.setTimeout(100_000);
    await gotoDeterministicChat(page);
    const nav = rail(page);
    await threadItem(page, CHAT_B).click();
    await expect(nav).toHaveAttribute("data-active-thread-id", CHAT_B);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("concierge-chat-view-mounted"), "the chat still mounts on refresh")
      .toBeVisible({ timeout: 20_000 });
    await expect(nav, "refresh reopens the same saved chat").toHaveAttribute(
      "data-active-thread-id", CHAT_B, { timeout: 20_000 });

    await page.getByTestId("nav-rentals-link").first().click();
    // React navigation is complete when the URL commits; waiting for full load
    // includes unrelated third-party assets and the cold dev-server build.
    await page.waitForURL("**/rentals", { waitUntil: "commit", timeout: 45_000 });
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(nav, "returning from Rentals keeps the conversation").toHaveAttribute(
      "data-active-thread-id", CHAT_B, { timeout: 20_000 });

    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await expect(nav, "a fresh navigation into /chat keeps it too").toHaveAttribute(
      "data-active-thread-id", CHAT_B, { timeout: 20_000 });
    await expect(page.getByText("Restoring your workspace"), "auth loading never replaces the shell")
      .toHaveCount(0);
  });

  test("the 390px drawer closes after choosing a chat, keeps it selected and returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoDeterministicChat(page);

    const trigger = page.getByTestId("nav-drawer-trigger");
    await trigger.click();
    const drawer = page.getByTestId("nav-drawer-content");
    await expect(drawer).toBeVisible();
    await drawer.locator(`[data-testid="nav-thread-item"][data-thread-id="${CHAT_A}"]`).first().click();

    await expect(drawer, "the drawer closes once a chat is chosen").toBeHidden({ timeout: 15_000 });
    await expect(rail(page), "the chosen chat is now the active one").toHaveAttribute(
      "data-active-thread-id", CHAT_A);
    await expect(trigger, "focus returns to the control that opened the drawer").toBeFocused();
  });
});
