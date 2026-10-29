import { test, expect, type Page } from "@playwright/test";

/**
 * SAN-1606 — the five-tab mobile navigation.
 *
 * One bar, five real routes, no consumer tab bar anywhere it does not belong, and no growth at the
 * desktop breakpoint. Measured as rendered boxes: the bar is 64px tall inside 12px side margins,
 * every tab is at least 44×44, and nothing overlaps the bar.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1024, height: 768 };
const BAR = '[data-testid="mobile-bottom-nav"]';
const TABS = [
  { testid: "mobile-nav-home", href: "/", label: "Home" },
  { testid: "mobile-nav-chat", href: "/chat", label: "Chat" },
  { testid: "mobile-nav-rentals", href: "/rentals", label: "Rentals" },
  { testid: "mobile-nav-restaurants", href: "/restaurants", label: "Eats" },
  { testid: "mobile-nav-events", href: "/events", label: "Events" },
] as const;

/**
 * Navigate with one retry. Cold `next dev` compiles each route on first visit and can drop a
 * connection under load (`ERR_EMPTY_RESPONSE`); that is a server hiccup, not a navigation defect,
 * so it gets exactly one second chance.
 */
async function gotoWithRetry(page: Page, path: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    } catch (error) {
      if (attempt >= 1) throw error;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
  }
}

async function open(page: Page, path: string) {
  const response = await gotoWithRetry(page, path);
  expect(response?.ok(), `GET ${path}`).toBe(true);
  // The bar is server-rendered from the request pathname, so the first paint already answers
  // "eligible route or not"; no fixed settle time is needed.
  await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});
}

async function barBox(page: Page) {
  return page.locator(BAR).boundingBox();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

/** The Next.js dev bubble sits over the bottom-left tab; production has no such overlay. */
async function activateHomeTab(page: Page) {
  await page.getByTestId("mobile-nav-home").focus();
  await page.keyboard.press("Enter");
}

test.describe("SAN-1606 mobile bottom navigation", () => {
  // Each test walks several cold-compiled routes in a dev server.
  test.describe.configure({ timeout: 150_000 });
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test("renders one bar with five real links on every supported mobile route", async ({ page }) => {
    for (const path of ["/", "/chat", "/rentals", "/restaurants", "/events"]) {
      await open(page, path);

      await expect(page.locator(BAR)).toHaveCount(1);
      const links = page.locator(`${BAR} a`);
      await expect(links).toHaveCount(5);
      // "Eats" is the visible label; its screen-reader-only suffix names the page it opens.
      await expect(links).toHaveText(["Home", "Chat", "Rentals", "Eats Restaurants", "Events"]);
      await expect(
        page.getByTestId("mobile-nav-restaurants").getByText("Eats", { exact: true }),
      ).toBeVisible();
      for (const [index, tab] of TABS.entries()) {
        await expect(links.nth(index)).toHaveAttribute("href", tab.href);
      }
      // "Eats" is the visible name; the accessible name still says what it opens.
      await expect(page.getByTestId("mobile-nav-restaurants")).toHaveAccessibleName(/Restaurants/);

      await expect(page.locator(`${BAR} [aria-current="page"]`)).toHaveCount(1);
      const box = await barBox(page);
      expect(box, `${path} bar box`).not.toBeNull();
      expect(Math.round(box!.height), `${path} bar height`).toBe(64);
      expect(Math.round(box!.x), `${path} bar left margin`).toBe(12);
      expect(Math.round(box!.width), `${path} bar width`).toBe(PHONE.width - 24);

      for (const tab of TABS) {
        const target = page.getByTestId(tab.testid);
        const targetBox = await target.boundingBox();
        expect(targetBox, `${tab.label} target`).not.toBeNull();
        expect(targetBox!.width, `${tab.label} width`).toBeGreaterThanOrEqual(44);
        expect(targetBox!.height, `${tab.label} height`).toBeGreaterThanOrEqual(44);
      }

      await expectNoHorizontalOverflow(page);
    }
  });

  test("marks the current route and keeps it through tab taps, Back and Forward", async ({ page }) => {
    await open(page, "/chat");
    await expect(page.getByTestId("mobile-nav-chat")).toHaveAttribute("aria-current", "page");

    await page.getByTestId("mobile-nav-rentals").click();
    await page.waitForURL("**/rentals");
    await expect(page.getByTestId("mobile-nav-rentals")).toHaveAttribute("aria-current", "page");

    await page.getByTestId("mobile-nav-restaurants").click();
    await page.waitForURL("**/restaurants");
    await expect(page.getByTestId("mobile-nav-restaurants")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(`${BAR} [aria-current="page"]`)).toHaveCount(1);

    await page.getByTestId("mobile-nav-events").click();
    await page.waitForURL("**/events");
    await expect(page.getByTestId("mobile-nav-events")).toHaveAttribute("aria-current", "page");

    await activateHomeTab(page);
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByTestId("mobile-nav-home")).toHaveAttribute("aria-current", "page");

    await page.goBack();
    await page.waitForURL("**/events");
    await expect(page.getByTestId("mobile-nav-events")).toHaveAttribute("aria-current", "page");

    await page.goForward();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByTestId("mobile-nav-home")).toHaveAttribute("aria-current", "page");
  });

  test("ordinary detail routes keep their parent tab; nested transactional routes get no bar", async ({
    page,
  }) => {
    test.setTimeout(200_000);

    // Data-independent first: the layout owns these routes even when the record is absent (the
    // database-less CI lane has no fixtures and these resolve to the not-found view inside the
    // same layout), so the bar and its active tab must still be right. Without this the checks
    // below could all skip and the test would pass on nothing.
    for (const [path, tab] of [
      ["/rentals/00000000-0000-4000-8000-000000000000", "rentals"],
      ["/restaurants/00000000-0000-4000-8000-000000000000", "restaurants"],
      ["/events/san-1606-e2e-missing-event", "events"],
    ] as const) {
      const response = await gotoWithRetry(page, path);
      expect(response?.status(), `GET ${path}`).toBeLessThan(500);
      await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});
      await expect(page.locator(BAR), `${path} keeps the consumer bar`).toHaveCount(1);
      await expect(page.getByTestId(`mobile-nav-${tab}`)).toHaveAttribute("aria-current", "page");
    }

    // Then, when the lane does have data, a real linked detail must behave the same way.
    await open(page, "/events");
    const eventHref = await page
      .locator('a[href^="/events/"]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href") ?? "")
          .find((href) => href.split("?")[0].split("/").filter(Boolean).length === 2),
      );
    if (eventHref) {
      await open(page, eventHref);
      await expect(page.locator(BAR)).toHaveCount(1);
      await expect(page.getByTestId("mobile-nav-events")).toHaveAttribute("aria-current", "page");
    }

    await open(page, "/restaurants");
    const restaurantHref = await page
      .locator('a[href^="/restaurants/"]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href") ?? "")
          .find((href) => href.split("?")[0].split("/").filter(Boolean).length === 2),
      );
    if (restaurantHref) {
      await open(page, restaurantHref);
      await expect(page.locator(BAR)).toHaveCount(1);
      await expect(page.getByTestId("mobile-nav-restaurants")).toHaveAttribute("aria-current", "page");
    }

    // A rental detail is reachable straight from its id, which the browse cards carry.
    await open(page, "/rentals");
    const rentalCards = page.locator('[data-testid^="rental-card-"]');
    const rentalId = (await rentalCards.count()) > 0
      ? await rentalCards.first().getAttribute("data-testid")
      : null;
    if (rentalId) {
      await open(page, `/rentals/${rentalId.replace("rental-card-", "")}`);
      await expect(page.locator(BAR)).toHaveCount(1);
      await expect(page.getByTestId("mobile-nav-rentals")).toHaveAttribute("aria-current", "page");
    }

    // Nested consumer paths are not details, and protected/transactional routes never get a bar.
    for (const path of ["/rentals/example/checkout", "/events/example/checkout"]) {
      // The bar must be absent whatever the page's own health: these lanes run without a
      // database, and several of these routes redirect to /login, so only the navigation
      // contract is asserted here (each page's own status/error behaviour has its owner).
      await gotoWithRetry(page, path);
      await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});
      expect(await page.locator(BAR).count(), `${path} must not render the consumer bar`).toBe(0);
    }
  });

  // Split in two: each route is cold-compiled by the dev server, and one test walking a dozen
  // first-visit routes can outrun its budget on a cold runner.
  test("never appears in the protected workspaces", async ({ page }) => {
    test.setTimeout(200_000);
    for (const path of [
      "/app",
      "/app/rentals",
      "/host",
      "/host/events",
      "/admin",
      "/saved",
      "/trips",
    ]) {
      // The bar must be absent whatever the page's own health: these lanes run without a
      // database, and several of these routes redirect to /login, so only the navigation
      // contract is asserted here (each page's own status/error behaviour has its owner).
      await gotoWithRetry(page, path);
      await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});
      expect(await page.locator(BAR).count(), `${path} must not render the consumer bar`).toBe(0);
    }
  });

  test("never appears on auth or unrelated consumer routes", async ({ page }) => {
    test.setTimeout(200_000);
    for (const path of ["/login", "/signup", "/cafes", "/nightlife", "/me"]) {
      await gotoWithRetry(page, path);
      await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});
      expect(await page.locator(BAR).count(), `${path} must not render the consumer bar`).toBe(0);
    }
  });

  test("/chat on a phone drops the top chip strip and builds no empty stripe", async ({ page }) => {
    await open(page, "/chat");
    // Mounted (the filter state must survive) but display:none: no box, no layout height.
    await expect(page.getByTestId("chat-query-bar")).toBeHidden();
    expect(await page.getByTestId("chat-query-bar").boundingBox()).toBeNull();
    await expect(page.locator('[data-testid="filter-chip-laureles"]')).toBeHidden();

    // Nothing is reserved between the header and the workspace: the strip took no height.
    const header = await page.locator('[data-testid="geo-chat-shell"] header').boundingBox();
    const canvas = await page.locator('[data-testid="chat-canvas"]').boundingBox();
    expect(canvas?.y).toBe((header?.y ?? 0) + (header?.height ?? 0));

    // The chat workspace still owns the space under that header (the real v2 composer is
    // asserted in the real-composer lane and in MOB-CK-001; the deterministic adapter has no
    // input of its own).
    await expect(page.getByTestId("copilot-chat-region")).toBeVisible({ timeout: 30_000 });
  });

  test("hides while an on-screen keyboard covers the viewport and returns when it closes", async ({
    page,
  }) => {
    // A controllable iOS-style overlay keyboard: the visual viewport shrinks while the layout
    // viewport does not. `__setKeyboard(0)` puts it away and notifies the listeners the app
    // registered, which is the only way to prove the bar comes back.
    await page.addInitScript(() => {
      const state = { keyboard: 320 };
      const listeners = new Set<EventListener>();
      const visualViewport = {
        get width() {
          return window.innerWidth;
        },
        get height() {
          return window.innerHeight - state.keyboard;
        },
        offsetTop: 0,
        offsetLeft: 0,
        pageTop: 0,
        pageLeft: 0,
        scale: 1,
        addEventListener: (_type: string, listener: EventListener) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: EventListener) => {
          listeners.delete(listener);
        },
        dispatchEvent: () => true,
      };
      Object.defineProperty(window, "visualViewport", { configurable: true, get: () => visualViewport });
      (window as unknown as { __setKeyboard: (height: number) => void }).__setKeyboard = (height) => {
        state.keyboard = height;
        for (const listener of listeners) listener(new Event("resize"));
      };
    });

    await open(page, "/chat");
    await expect(page.getByTestId("copilot-chat-region")).toBeVisible({ timeout: 30_000 });

    // Nothing overlays the composer: the bar unmounts while the keyboard covers the viewport.
    await expect(page.locator(BAR)).toHaveCount(0);

    // …and it must come back with the keyboard away (the reserved space too).
    await page.evaluate(() => {
      (window as unknown as { __setKeyboard: (height: number) => void }).__setKeyboard(0);
    });
    await expect(page.locator(BAR)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mobile-nav-chat")).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(() => document.documentElement.dataset.mdeNoNav ?? null),
      "the keyboard-only marker is cleaned up",
    ).toBeNull();
  });

  test("fits 320px and 428px without overflow and keeps 44px targets", async ({ page }) => {
    for (const width of [320, 428]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["/", "/chat", "/rentals", "/restaurants", "/events"]) {
        await open(page, path);
        const box = await barBox(page);
        expect(box, `${width} ${path} bar`).not.toBeNull();
        expect(Math.round(box!.x)).toBe(12);
        expect(Math.round(box!.x + box!.width)).toBe(width - 12);
        expect(Math.round(box!.height)).toBe(64);
        for (const tab of TABS) {
          const targetBox = await page.getByTestId(tab.testid).boundingBox();
          expect(targetBox!.width, `${width} ${tab.label} width`).toBeGreaterThanOrEqual(44);
          expect(targetBox!.height, `${width} ${tab.label} height`).toBeGreaterThanOrEqual(44);
        }
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});

test.describe("SAN-1606 desktop boundary", () => {
  test.use({ viewport: DESKTOP });

  test("keeps the original desktop UI: no bar, chips and the full composer stay", async ({ page }) => {
    // Five cold-compiled routes, including the real /chat runtime: the default 60s is not enough.
    test.setTimeout(180_000);
    for (const path of ["/", "/chat", "/rentals", "/restaurants", "/events"]) {
      await open(page, path);
      // The bar is display:none above `lg` (so it is out of the accessibility tree and tab order).
      await expect(page.locator(BAR), `${path} must not show the phone bar`).toBeHidden();
    }

    await open(page, "/chat");
    await expect(page.getByTestId("chat-query-bar")).toBeVisible();
    await expect(page.getByTestId("filter-chip-laureles")).toBeVisible();

    // The compact single-row composer is a phone-only contract. This lane renders its own chat
    // adapter, so the mandatory real-composer desktop assertion lives in MOB-CK-001 (the
    // `real mobile composer chromium` job); the guarded check below only covers the case where a
    // real input happens to be present.
    const composer = page.getByTestId("copilot-chat-input");
    if (await composer.count()) {
      expect((await composer.boundingBox())!.height).toBeGreaterThan(64);
    }
  });
});
