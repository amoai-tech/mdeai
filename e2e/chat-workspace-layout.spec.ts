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
 *   - "New chat", Explore and Library stay on screen and the message box is pinned at the bottom,
 *     also for a short conversation (the gap above it is expected, as in Mindtrip).
 *
 * This spec runs the deterministic chat (a stand-in for the CopilotKit view, so it can run without an
 * AI runtime). `chat-workspace-layout-real.spec.ts` proves the same contract on the real CopilotKit
 * chat. `chat-result-order.spec.ts` owns answer → results → message box order and stays untouched.
 */

const VIEWPORTS = [
  { width: 1024, height: 768, sidebar: 208, column: 408 },
  { width: 1280, height: 800, sidebar: 240, column: 520 },
  { width: 1366, height: 768, sidebar: 240, column: 563 },
  { width: 1440, height: 900, sidebar: 240, column: 600 },
  { width: 2000, height: 1166, sidebar: 240, column: 880 },
] as const;

/** The pinned box sits at the bottom: its lower edge is inside the window and within this distance. */
const PINNED_BOTTOM_TOLERANCE = 120;

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

async function askForRentals(page: Page, cards: number) {
  const response = waitForPost(page, "/api/rentals/search");
  await typeAndSubmit(page, RENTAL_QUERY);
  expect((await response).ok()).toBe(true);
  await expect(page.getByTestId("rental-card")).toHaveCount(cards);
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
    };
  });
}

/**
 * The element that scrolls the conversation: the nearest scrollable ancestor of the newest rental card.
 * Proves it overflows, that scrolling it moves it (not the page), and that the message box stays put.
 */
async function proveTranscriptScroller(page: Page) {
  return page.evaluate(() => {
    const cards = document.querySelectorAll('[data-testid="rental-card"]');
    const last = cards[cards.length - 1];
    let scroller: HTMLElement | null = last instanceof HTMLElement ? last : null;
    while (scroller) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 4) break;
      scroller = scroller.parentElement;
    }
    if (!scroller) return null;
    const input = document.querySelector('[data-testid="copilot-chat-input"]');
    const boxTop = () => Math.round(input?.getBoundingClientRect().top ?? -1);
    const startedAtBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8;
    const before = boxTop();
    scroller.scrollTop = 0;
    return {
      overflows: scroller.scrollHeight > scroller.clientHeight + 4,
      startedAtBottom,
      scrolledToTop: scroller.scrollTop === 0,
      pageScrollY: window.scrollY,
      boxMoved: boxTop() !== before,
      lastCardAboveBoxAtBottom: (() => {
        scroller.scrollTop = scroller.scrollHeight;
        return (last?.getBoundingClientRect().bottom ?? Infinity) <= boxTop() + 1;
      })(),
    };
  });
}

test.describe("SAN-1414 /chat is a fixed workspace", { tag: ["@deterministic"] }, () => {
  test.beforeEach(async ({ page }) => {
    await mockFastPaths(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`page fits the window, columns split 50 / 50, box stays pinned at ${viewport.width}×${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockSavedChats(page, 13);
      await gotoDeterministicChat(page);
      await expect(page.getByTestId("nav-thread-item")).toHaveCount(13);

      const empty = await measure(page);
      expect(empty.pageHeight, "empty chat: the page must not be taller than the window").toBeLessThanOrEqual(
        empty.windowHeight,
      );
      expect(empty.composerBottom ?? Infinity).toBeLessThanOrEqual(empty.windowHeight);
      expect(empty.columns).toHaveLength(3);
      expect(Math.abs(empty.columns[0] - viewport.sidebar), `sidebar width ${empty.columns[0]}`).toBeLessThanOrEqual(1);
      expect(Math.abs(empty.columns[1] - viewport.column), `chat width ${empty.columns[1]}`).toBeLessThanOrEqual(1);
      expect(Math.abs(empty.columns[2] - viewport.column), `map width ${empty.columns[2]}`).toBeLessThanOrEqual(1);

      // Short conversation: one question, one answer. The box stays pinned at the bottom.
      await askForRentals(page, 1);
      const short = await measure(page);
      expect(short.pageHeight).toBeLessThanOrEqual(short.windowHeight);
      expect(short.composerBottom ?? Infinity, "short chat: the box must be inside the window").toBeLessThanOrEqual(
        short.windowHeight,
      );
      expect(
        short.windowHeight - (short.composerBottom ?? 0),
        "short chat: the box must stay pinned near the bottom of the window",
      ).toBeLessThanOrEqual(PINNED_BOTTOM_TOLERANCE);

      // Tall conversation: ten cards. The page still does not grow; the transcript scrolls by itself.
      await mockTenRentals(page);
      await askForRentals(page, 10);
      const tall = await measure(page);
      expect(tall.pageHeight, "ten cards: the page must not grow").toBeLessThanOrEqual(tall.windowHeight);
      expect(tall.pageScrollY).toBe(0);
      expect(tall.composerBottom ?? Infinity).toBeLessThanOrEqual(tall.windowHeight);

      const scroller = await proveTranscriptScroller(page);
      expect(scroller, "the transcript must have its own scroller").not.toBeNull();
      expect(scroller?.overflows).toBe(true);
      expect(scroller?.startedAtBottom, "the newest results are scrolled into view").toBe(true);
      expect(scroller?.scrolledToTop, "scrolling moves the transcript").toBe(true);
      expect(scroller?.pageScrollY, "scrolling the transcript must not scroll the page").toBe(0);
      expect(scroller?.boxMoved, "the message box must not move while the transcript scrolls").toBe(false);
      expect(scroller?.lastCardAboveBoxAtBottom).toBe(true);

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

      const sidebar = await page.evaluate(() => {
        const aside = document.querySelector("aside");
        const list = document.querySelector('[data-testid="nav-thread-list"]');
        return {
          asideScrolls: !!aside && aside.scrollHeight > aside.clientHeight + 1,
          listOverflowY: list ? getComputedStyle(list).overflowY : null,
          listScrolls: !!list && list.scrollHeight > list.clientHeight + 4,
        };
      });
      expect(sidebar.listOverflowY).toBe("auto");
      expect(sidebar.asideScrolls, "at 900px tall the sidebar itself must not scroll — only the chat list").toBe(false);
      if (count === 20) expect(sidebar.listScrolls, "20 chats must scroll inside their own list").toBe(true);

      const page1 = await measure(page);
      expect(page1.pageHeight, "the page itself must not scroll").toBeLessThanOrEqual(page1.windowHeight);
    });
  }

  test("with no saved chats the empty message stays on screen and nothing scrolls (1440×900)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockSavedChats(page, 0);
    await gotoDeterministicChat(page);
    await expect(page.getByTestId("nav-thread-item")).toHaveCount(0);
    const empty = page.getByTestId("nav-threads-empty");
    await expect(empty).toBeVisible();
    const box = await empty.boundingBox();
    expect(box, "the empty message must be on screen").not.toBeNull();
    expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= 900).toBe(true);
    for (const testId of ["nav-new-chat", "nav-restaurants-link", "nav-saved-link"]) {
      const link = await page.getByTestId(testId).first().boundingBox();
      expect((link?.y ?? -1) >= 0 && (link?.y ?? 0) + (link?.height ?? 0) <= 900, `${testId} must be inside the window`).toBe(true);
    }
    const sidebar = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      return { asideScrolls: !!aside && aside.scrollHeight > aside.clientHeight + 1 };
    });
    expect(sidebar.asideScrolls, "an empty chat list must not make the sidebar scroll").toBe(false);
    const measured = await measure(page);
    expect(measured.pageHeight).toBeLessThanOrEqual(measured.windowHeight);
  });

  test("the sidebar's supported height: 720px keeps one scroll owner, shorter windows fall back without losing the box", async ({
    page,
  }) => {
    await mockSavedChats(page, 13);
    await page.setViewportSize({ width: 1440, height: 720 });
    await gotoDeterministicChat(page);

    // 720px is the smallest supported window: fixed groups stay put, the chat list is the only scroller.
    const supported = await page.evaluate(() => {
      const aside = document.querySelector("aside")!;
      const list = document.querySelector('[data-testid="nav-thread-list"]')!;
      return { asideScrolls: aside.scrollHeight > aside.clientHeight + 1, listHeight: list.clientHeight };
    });
    expect(supported.asideScrolls, "720px: only the chat list scrolls").toBe(false);
    expect(supported.listHeight, "720px: the chat list keeps a usable height").toBeGreaterThanOrEqual(96);

    // Shorter than that the whole sidebar scrolls as a last resort; the page and the box still do not move.
    await page.setViewportSize({ width: 1440, height: 600 });
    await expect(page.getByTestId("nav-new-chat")).toBeVisible();
    const short = await measure(page);
    expect(short.pageHeight, "600px: the page must not scroll").toBeLessThanOrEqual(short.windowHeight);
    expect(short.composerBottom ?? Infinity, "600px: the box must stay inside the window").toBeLessThanOrEqual(
      short.windowHeight,
    );
  });

  test("the phone drawer shows New chat first and scrolls its own chat list (390×844)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSavedChats(page, 20);
    await gotoDeterministicChat(page);

    await page.getByTestId("nav-drawer-trigger").click();
    const drawer = page.getByTestId("nav-drawer-content");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("nav-new-chat")).toBeVisible();
    await expect(drawer.getByTestId("nav-restaurants-link")).toBeVisible();

    const state = await drawer.evaluate((node) => {
      const list = node.querySelector('[data-testid="nav-thread-list"]');
      const newChat = node.querySelector('[data-testid="nav-new-chat"]')?.getBoundingClientRect();
      return {
        listScrolls: !!list && list.scrollHeight > list.clientHeight + 4,
        newChatTop: Math.round(newChat?.top ?? -1),
        sidewaysOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    // SAN-1412: high-value mobile actions are comfortable to tap without affecting desktop density.
    const newChatHeight = await drawer.getByTestId("nav-new-chat").evaluate((el) => el.getBoundingClientRect().height);
    const threadHeight = await drawer.getByTestId("nav-thread-item").first().evaluate((el) => el.getBoundingClientRect().height);
    expect(newChatHeight).toBeGreaterThanOrEqual(44);
    expect(threadHeight).toBeGreaterThanOrEqual(44);
    expect(state.listScrolls, "20 chats scroll inside the drawer's own list").toBe(true);
    expect(state.newChatTop, "New chat is near the top of the drawer").toBeLessThan(160);
    expect(state.sidewaysOverflow, "no sideways scrolling").toBeLessThanOrEqual(0);
  });
});

/**
 * SAN-1412 · Give new and reopened saved chats real titles and refresh the sidebar.
 *
 * Opening a saved chat that still shows the dated fallback asks the server to name it (no title in the
 * request: the server derives it), and the sidebar shows the new title without a reload or a loading
 * flash. The server's answers are mocked here; the derivation and the owner check are covered by the
 * unit and route tests.
 */
test.describe("SAN-1412 saved chat titles", { tag: ["@deterministic"] }, () => {
  test("opening an untitled saved chat names it and refreshes the sidebar without a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const TITLE = "Find me a quiet 2-bedroom in Laureles under COP 4M.";
    let title: string | null = null;
    const patches: Array<{ method: string; body: string | null }> = [];
    await page.route("**/api/threads", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ threads: [{ id: "t-1", title, updatedAt: "2026-10-16T17:32:00.000Z" }] }),
      }),
    );
    await page.route("**/api/threads/t-1", (route) => {
      patches.push({ method: route.request().method(), body: route.request().postData() });
      title = TITLE;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ updated: true, title: TITLE }),
      });
    });
    await mockFastPaths(page);
    await gotoDeterministicChat(page);

    const item = page.getByTestId("nav-thread-item");
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("Chat ·");

    await page.evaluate(() => {
      (window as unknown as { __noReload: string }).__noReload = "same-page";
    });
    await item.click();

    await expect(item).toHaveText(TITLE);
    expect(patches).toEqual([{ method: "PATCH", body: null }]);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: string }).__noReload)).toBe("same-page");
  });
});

/**
 * SAN-1504 · Open Rental Details Beside the Map in Chat Instead of a Pop-Up Sheet.
 *
 * On a desktop, Details on a chat rental card swaps the map column for the rental details panel and
 * the conversation, cards and message box stay where they are; Close brings the map back. On a phone
 * the same selection opens the rental sheet. Only one detail view exists at a time, and opening it
 * starts no AI run and no extra request.
 */
const detailsButton = (page: Page) => page.getByTestId("rental-card").getByRole("button", { name: /details/i }).first();

test.describe("SAN-1504 chat rental Details", { tag: ["@deterministic"] }, () => {
  test.beforeEach(async ({ page }) => {
    await mockFastPaths(page);
  });

  test("1440px: Details opens beside the chat, Close restores the map", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoDeterministicChat(page);
    await askForRentals(page, 1);

    const requests: string[] = [];
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    const mapPanel = page.getByTestId("map-panel");
    await expect(mapPanel).toHaveAttribute("data-right-column-mode", "map");

    await detailsButton(page).click();
    await expect(mapPanel).toHaveAttribute("data-right-column-mode", "detail");
    const panel = page.getByTestId("rental-details-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator("h2")).not.toBeEmpty();
    // The conversation, the card and the message box are still on screen next to it.
    await expect(page.getByTestId("rental-card")).toBeVisible();
    await expect(page.getByTestId("copilot-chat-input")).toBeVisible();
    // The old pop-up must not open beside the panel.
    await expect(page.getByTestId("venue-detail-sheet")).toHaveCount(0);
    expect(requests.filter((path) => path.startsWith("/api/")), "opening Details makes no request").toEqual([]);

    await page.getByTestId("rental-details-close").click();
    await expect(panel).toBeHidden();
    await expect(mapPanel).toHaveAttribute("data-right-column-mode", "map");
    await expect(page.getByTestId("chat-map")).toBeVisible();
    await expect(page.getByTestId("rental-card")).toBeVisible();
  });

  test("1440px: a source-linked ad with no coordinates opens read-only details and no pin is invented", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const noCoords: Record<string, unknown> = { ...rental };
    delete noCoords.latitude;
    delete noCoords.longitude;
    await page.route("**/api/rentals/search", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              ...noCoords,
              id: "rnt_external_001",
              title: "Source-linked apartment in Laureles",
              source_url: "https://www.fincaraiz.com.co/apartamento/1",
              source_provider: "Fincaraíz",
              tags: ["external-source"],
              can_schedule_viewing: false,
              schedule_viewing_url: null,
              price_monthly: 2_400_000,
              currency: "COP",
            },
          ],
          total: 1,
          source: "mock",
        }),
      }),
    );
    await gotoDeterministicChat(page);
    await askForRentals(page, 1);

    await detailsButton(page).click();
    const panel = page.getByTestId("rental-details-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("rental-details-price")).toContainText("2,400,000");
    await expect(page.getByTestId("rental-details-schedule-cta")).toHaveCount(0);
    await expect(page.getByTestId("rental-details-source-link")).toHaveAttribute("href", /fincaraiz\.com\.co/);
    await expect(page.getByTestId("rental-details-map-link")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("390px: Details opens the rental sheet, only one detail view, and Close returns to the chat", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoDeterministicChat(page);
    await askForRentals(page, 1);

    await detailsButton(page).click();
    const sheet = page.getByTestId("rental-details-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("venue-detail-sheet")).toHaveCount(0);
    await expect(page.getByTestId("rental-details-panel")).toHaveCount(0);
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways, "no sideways scrolling").toBeLessThanOrEqual(0);

    await page.getByTestId("rental-details-close").click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("rental-card")).toBeVisible();
    await expect(page.getByTestId("copilot-chat-input")).toBeVisible();
  });
});
