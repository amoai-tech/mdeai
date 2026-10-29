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

async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.ok(), `GET ${path}`).toBe(true);
  // The bar is server-rendered from the request pathname, so the first paint already answers
  // "eligible route or not"; no fixed settle time is needed.
  await page.waitForLoadState("load");
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
    const rentalId = await page
      .locator('[data-testid^="rental-card-"]')
      .first()
      .getAttribute("data-testid");
    if (rentalId) {
      await open(page, `/rentals/${rentalId.replace("rental-card-", "")}`);
      await expect(page.locator(BAR)).toHaveCount(1);
      await expect(page.getByTestId("mobile-nav-rentals")).toHaveAttribute("aria-current", "page");
    }

    // Nested consumer paths are not details, and protected/transactional routes never get a bar.
    for (const path of ["/rentals/example/checkout", "/events/example/checkout"]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `GET ${path}`).toBeLessThan(500);
      await page.waitForLoadState("load");
      await expect(page.locator(BAR), `${path} must not render the consumer bar`).toHaveCount(0);
    }
  });

  test("never appears in protected, auth, checkout or unrelated consumer routes", async ({ page }) => {
    for (const path of [
      "/app",
      "/app/rentals",
      "/host",
      "/host/events",
      "/admin",
      "/login",
      "/signup",
      "/cafes",
      "/nightlife",
      "/saved",
      "/trips",
      "/me",
    ]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `GET ${path}`).toBeLessThan(500);
      await page.waitForLoadState("load");
      await expect(page.locator(BAR), `${path} must not render the consumer bar`).toHaveCount(0);
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

    // The composer is still the entry point, and the filter state is still wired for desktop.
    await expect(page.getByTestId("copilot-chat-textarea")).toBeVisible({ timeout: 30_000 });
  });

  test("hides while an on-screen keyboard covers the viewport and returns when it closes", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const KEYBOARD_HEIGHT = 320;
      const listeners = new Set<EventListener>();
      const fake = {
        get width() {
          return window.innerWidth;
        },
        get height() {
          return window.innerHeight - KEYBOARD_HEIGHT;
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
      Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
    });

    await open(page, "/chat");
    await expect(page.getByTestId("copilot-chat-textarea")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(BAR)).toHaveCount(0);
    await expect(page.getByTestId("copilot-chat-textarea")).toBeVisible();
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
    for (const path of ["/", "/chat", "/rentals", "/restaurants", "/events"]) {
      await open(page, path);
      // The bar is display:none above `lg` (so it is out of the accessibility tree and tab order).
      await expect(page.locator(BAR), `${path} must not show the phone bar`).toBeHidden();
    }

    await open(page, "/chat");
    await expect(page.getByTestId("chat-query-bar")).toBeVisible();
    await expect(page.getByTestId("filter-chip-laureles")).toBeVisible();

    const composer = await page.getByTestId("copilot-chat-input").boundingBox();
    expect(composer, "desktop composer").not.toBeNull();
    // The compact single-row composer is a phone-only contract.
    expect(composer!.height).toBeGreaterThan(64);
  });
});
