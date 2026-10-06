import { test, expect, type Page } from "@playwright/test";
import {
  RENTAL_QUERY,
  gotoDeterministicChat,
  mockFastPaths,
  rental,
  typeAndSubmit,
  waitForPost,
} from "./helpers/deterministic-chat";

/**
 * SAN-1414 · Make /chat fit the window like Mindtrip: bigger map, readable chat column, message box
 * always on screen.
 *
 * On a desktop window `/chat` is a fixed workspace:
 *   - the outer page never scrolls;
 *   - sidebar 208px (1024–1279) or 240px (1280+), then chat and map split what is left 50 / 50;
 *   - the saved-chat list and the conversation are separate internal scroll regions;
 *   - "New chat", Explore and Library stay on screen and the message box is always inside the window.
 *
 * `chat-result-order.spec.ts` owns answer → results → message box order and stays untouched.
 */

const VIEWPORTS = [
  { width: 1024, height: 768, sidebar: 208, column: 408 },
  { width: 1280, height: 800, sidebar: 240, column: 520 },
  { width: 1440, height: 900, sidebar: 240, column: 600 },
  { width: 2000, height: 1166, sidebar: 240, column: 880 },
] as const;


function savedChats(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `thread-${index}`,
    title: "Untitled Thread",
    updatedAt: new Date(Date.UTC(2026, 9, 5, 12, 0, 0) - index * 3_600_000).toISOString(),
  }));
}

async function mockSavedChats(page: Page, count: number) {
  await page.route("**/api/threads", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ threads: savedChats(count) }),
    }),
  );
}

/** Ten rental cards: a result list far taller than the window. */
async function mockTenRentals(page: Page) {
  const results = Array.from({ length: 10 }, (_, index) => ({
    ...rental,
    id: `rnt_layout_${index}`,
    title: `Deterministic ${index + 1}BR in Laureles`,
    source_url: `https://mdeai.co/rentals/rnt_layout_${index}`,
  }));
  await page.route("**/api/rentals/search", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results, total: results.length, source: "mock" }),
    }),
  );
}

async function askForTenRentals(page: Page) {
  const response = waitForPost(page, "/api/rentals/search");
  await typeAndSubmit(page, RENTAL_QUERY);
  expect((await response).ok()).toBe(true);
  await expect(page.getByTestId("rental-card")).toHaveCount(10);
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="chat-canvas"]');
    const input = document.querySelector('[data-testid="copilot-chat-input"]');
    const columns = canvas
      ? getComputedStyle(canvas)
          .gridTemplateColumns.split(" ")
          .map((value) => Math.round(parseFloat(value)))
      : [];
    const box = input?.getBoundingClientRect();
    return {
      windowHeight: window.innerHeight,
      pageHeight: document.documentElement.scrollHeight,
      pageScrollY: window.scrollY,
      columns,
      composerBottom: box ? Math.round(box.bottom) : null,
      composerTop: box ? Math.round(box.top) : null,
    };
  });
}

test.describe("SAN-1414 /chat is a fixed workspace", { tag: ["@deterministic"] }, () => {
  test.beforeEach(async ({ page }) => {
    await mockFastPaths(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`page fits the window, columns split 50 / 50, box stays on screen at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockSavedChats(page, 13);
      await mockTenRentals(page);
      await gotoDeterministicChat(page);
      await expect(page.getByTestId("nav-thread-item")).toHaveCount(13);

      const empty = await measure(page);
      expect(empty.pageHeight, "empty chat: the page must not be taller than the window").toBeLessThanOrEqual(
        empty.windowHeight,
      );
      expect(empty.composerBottom ?? Infinity, "empty chat: the message box must be inside the window").toBeLessThanOrEqual(
        empty.windowHeight,
      );
      expect(empty.columns).toHaveLength(3);
      expect(Math.abs(empty.columns[0] - viewport.sidebar), `sidebar width ${empty.columns[0]}`).toBeLessThanOrEqual(1);
      expect(Math.abs(empty.columns[1] - viewport.column), `chat width ${empty.columns[1]}`).toBeLessThanOrEqual(1);
      expect(Math.abs(empty.columns[2] - viewport.column), `map width ${empty.columns[2]}`).toBeLessThanOrEqual(1);

      await askForTenRentals(page);
      const answered = await measure(page);
      expect(answered.pageHeight, "ten cards: the page must not grow").toBeLessThanOrEqual(answered.windowHeight);
      expect(answered.pageScrollY).toBe(0);
      expect(answered.composerBottom ?? Infinity, "ten cards: the message box must stay inside the window").toBeLessThanOrEqual(
        answered.windowHeight,
      );

      // The long answer scrolls inside the chat column, not the page.
      const innerScroll = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="center-chat-panel"]');
        if (!panel) return null;
        const scrollers = [panel, ...panel.querySelectorAll("*")].filter((node) => {
          const style = getComputedStyle(node);
          return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4;
        });
        return scrollers.length;
      });
      expect(innerScroll, "the conversation must scroll inside the chat column").toBeGreaterThan(0);

      // The map fills the column it was given.
      const map = await page.getByTestId("map-panel").first().boundingBox();
      expect(map, "map panel must be on screen").not.toBeNull();
      expect(Math.abs((map?.width ?? 0) - viewport.column)).toBeLessThanOrEqual(2);
    });
  }

  for (const count of [13, 20]) {
    test(`with ${count} saved chats New chat stays visible and only the chat list scrolls (1440×900)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mockSavedChats(page, count);
      await gotoDeterministicChat(page);
      await expect(page.getByTestId("nav-thread-item")).toHaveCount(count);

      for (const testId of ["nav-new-chat", "nav-restaurants-link", "nav-saved-link"]) {
        const box = await page.getByTestId(testId).first().boundingBox();
        expect(box, `${testId} must be on screen`).not.toBeNull();
        expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= 900, `${testId} must be inside the window`).toBe(
          true,
        );
      }

      const list = await page.getByTestId("nav-thread-list").evaluate((node) => ({
        scrolls: node.scrollHeight > node.clientHeight + 4,
        overflowY: getComputedStyle(node).overflowY,
      }));
      expect(list.overflowY).toBe("auto");
      if (count === 20) expect(list.scrolls, "20 chats must scroll inside their own list").toBe(true);

      const page1 = await measure(page);
      expect(page1.pageHeight, "the page itself must not scroll").toBeLessThanOrEqual(page1.windowHeight);
    });
  }
});
