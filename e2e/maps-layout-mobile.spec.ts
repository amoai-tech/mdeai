import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  gotoDeterministicChat,
  mockFastPaths,
  RENTAL_QUERY,
  RESTAURANT_QUERY,
  restaurant,
  rental,
  typeAndSubmit,
  waitForPost,
} from "./helpers/deterministic-chat";
import { sendConciergeMessage } from "./helpers/maps-layout";

const PHONE_390 = { width: 390, height: 844 };
const PHONE_360 = { width: 360, height: 800 };

async function seedRentalPin(page: Page) {
  await mockFastPaths(page);
  await gotoDeterministicChat(page);
  const responsePromise = waitForPost(page, "/api/rentals/search");
  await typeAndSubmit(page, RENTAL_QUERY);
  expect((await responsePromise).ok()).toBe(true);
  await expect(page.getByTestId("rental-card")).toHaveCount(1);
}

async function seedRestaurantPins(page: Page) {
  await mockFastPaths(page);
  await page.route("**/api/restaurants/search", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          restaurant,
          {
            ...restaurant,
            id: "rst_mobile_002",
            name: "Deterministic Patio",
            latitude: 6.2476,
            longitude: -75.585,
          },
          {
            ...restaurant,
            id: "rst_mobile_003",
            name: "Deterministic Terrace",
            latitude: 6.255,
            longitude: -75.5795,
          },
        ],
        total: 3,
        source: "mock",
      }),
    });
  });
  await gotoDeterministicChat(page);
  // Reuse the canonical accepted-submit retry contract. A first submit can be
  // discarded before the app issues any request; the helper retries only in
  // that case and never double-submits an accepted request.
  await sendConciergeMessage(page, RESTAURANT_QUERY);
  await expect(page.getByTestId("restaurant-card")).toHaveCount(3, {
    timeout: 20_000,
  });
}

async function expectTouchContext(page: Page, viewport: { width: number; height: number }) {
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.innerWidth)).toBe(viewport.width);
  expect(await page.evaluate(() => window.innerHeight)).toBe(viewport.height);
}

/**
 * Measure a control the way a thumb meets it: at rest.
 *
 * The map sheet slides in over ~200 ms. While a control is moving by a transform, the browser's
 * bounding box carries floating-point error: a 44px Close button reads 43.99998474121094 for about
 * a fifth of the slide, so a single measurement failed roughly one run in five (seen on #271, #272,
 * #278 and #279). Poll actual rendered dimensions until the animation settles instead of awaiting
 * every document animation: a paused animation might never finish. Keep the 44px requirement exact.
 */
async function expectMinimumTouchTarget(locator: Locator, label: string) {
  await expect
    .poll(async () => (await locator.boundingBox())?.width ?? 0, {
      message: `${label} width must reach 44px after layout settles`,
      timeout: 5_000,
    })
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => (await locator.boundingBox())?.height ?? 0, {
      message: `${label} height must reach 44px after layout settles`,
      timeout: 5_000,
    })
    .toBeGreaterThanOrEqual(44);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

async function openRentalMap(page: Page) {
  const trigger = page.getByTestId("map-sheet-trigger");
  await expect(trigger).toBeVisible();
  await trigger.tap();
  const sheet = page.getByTestId("map-sheet-content");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("chat-map")).toBeVisible();
  await expect(page.locator('[data-testid="chat-map"]:visible')).toHaveCount(1);
  return { trigger, sheet };
}

test.describe("SAN-524 mobile map interaction — 390×844 touch", () => {
  test.use({
    viewport: PHONE_390,
    isMobile: true,
    hasTouch: true,
  });

  test("map close control and unselected pin meet the 44×44 touch target", async ({
    page,
  }) => {
    await seedRentalPin(page);
    await expectTouchContext(page, PHONE_390);
    const { sheet } = await openRentalMap(page);

    await expectMinimumTouchTarget(
      sheet.getByRole("button", { name: "Close" }),
      "map Close control",
    );
    await expectMinimumTouchTarget(
      sheet.getByTestId("map-pin").first(),
      "unselected map pin",
    );
    await expectNoHorizontalOverflow(page);
  });

  test("touch selection survives close and reopen without a second map state", async ({
    page,
  }) => {
    await seedRentalPin(page);
    const { trigger, sheet } = await openRentalMap(page);

    const pin = sheet.getByTestId("map-pin").first();
    const pinId = await pin.getAttribute("data-pin-id");
    expect(pinId).toBeTruthy();

    await pin.tap();
    await expect(
      sheet.locator(
        `[data-testid="map-pin"][data-pin-id="${pinId}"][data-marker-selected="true"]`,
      ),
    ).toBeVisible();
    await expect(sheet.getByTestId("selected-place-overlay")).toHaveAttribute(
      "data-pin-id",
      pinId!,
    );

    await sheet.getByRole("button", { name: "Close" }).tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("copilot-chat-textarea")).toBeVisible();

    await trigger.tap();
    await expect(sheet).toBeVisible();
    await expect(
      sheet.locator(
        `[data-testid="map-pin"][data-pin-id="${pinId}"][data-marker-selected="true"]`,
      ),
    ).toBeVisible();
    await expect(sheet.getByTestId("selected-place-overlay")).toHaveAttribute(
      "data-pin-id",
      pinId!,
    );
  });

  test("touch compatibility hover after close cannot replace the selected pin", async ({
    page,
  }) => {
    await seedRestaurantPins(page);
    const trigger = page.getByTestId("map-sheet-trigger");
    await trigger.tap();
    const sheet = page.getByTestId("map-sheet-content");
    await expect(sheet).toBeVisible();

    const pins = sheet.getByTestId("map-pin");
    const selectedPin = pins.nth(1);
    const selectedPinId = await selectedPin.getAttribute("data-pin-id");
    expect(selectedPinId).toBeTruthy();
    await selectedPin.tap();

    const selectedCard = page.locator(
      `[data-testid="restaurant-card"][data-pin-id="${selectedPinId}"]`,
    );
    await expect(selectedCard).toHaveAttribute("data-selected", "true");

    await sheet.getByRole("button", { name: "Close" }).tap();
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();

    const otherCard = page
      .locator(
        `[data-testid="restaurant-card"]:not([data-pin-id="${selectedPinId}"])`,
      )
      .first();

    // Touch browsers can synthesize mouse pointer-entry events when a touched
    // modal disappears. A no-hover/coarse phone must ignore that compatibility
    // event so it cannot replace the explicit map selection underneath.
    expect(
      await page.evaluate(() =>
        window.matchMedia("(any-hover: hover) and (any-pointer: fine)").matches,
      ),
    ).toBe(false);
    await otherCard.dispatchEvent("pointerover", { pointerType: "mouse" });
    await expect(selectedCard).toHaveAttribute("data-selected", "true");
    await expect(otherCard).toHaveAttribute("data-selected", "false");
  });

  test("Escape still closes before a focused map child can swallow the key", async ({
    page,
  }) => {
    await mockFastPaths(page);
    await gotoDeterministicChat(page);

    const trigger = page.getByTestId("map-sheet-trigger");
    await trigger.tap();
    const sheet = page.getByTestId("map-sheet-content");
    await expect(sheet).toBeVisible();

    await page.evaluate(() => {
      const map = document.querySelector(
        '[data-testid="map-sheet-content"] [data-testid="chat-map"]',
      );
      if (!map) throw new Error("no map in the sheet");
      const inner = document.createElement("div");
      inner.tabIndex = 0;
      inner.setAttribute("data-testid", "map-focus-target");
      map.appendChild(inner);
      map.addEventListener("keydown", (event) => event.stopPropagation());
      inner.focus();
    });

    await expect(page.getByTestId("map-focus-target")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 10_000 });
    await expect(trigger).toBeFocused();
  });
});

test.describe("SAN-524 mobile map interaction — 360×800 touch", () => {
  test.use({
    viewport: PHONE_360,
    isMobile: true,
    hasTouch: true,
  });

  test("open → select → close remains inside the narrow viewport", async ({ page }) => {
    await seedRentalPin(page);
    await expectTouchContext(page, PHONE_360);
    const { sheet } = await openRentalMap(page);

    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box ? box.y + box.height : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(PHONE_360.height + 1);
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(sheetBox!.x).toBeGreaterThanOrEqual(0);
    expect(sheetBox!.y).toBeGreaterThanOrEqual(0);
    expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(PHONE_360.width + 1);

    const pin = sheet.getByTestId("map-pin").first();
    await pin.tap();
    await expect(sheet.getByTestId("selected-place-overlay")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await sheet.getByRole("button", { name: "Close" }).tap();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId("copilot-chat-textarea")).toBeVisible();
  });
});
// SAN-1505 — real computed CSS + image decode proof. Static React markup can
// contain a hidden <img>, so the component tests alone cannot certify phone media.
test.describe("SAN-1505 rental photos on narrow chat cards", () => {
  test.use({ isMobile: true, hasTouch: true });

  for (const viewport of [PHONE_390, PHONE_360]) {
    test(`approved rental image visibly loads at ${viewport.width}px without horizontal scroll`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockFastPaths(page);
      await page.route("**/e2e-approved-rental.webp", (route) =>
        route.fulfill({
          status: 200,
          contentType: "image/png",
          // Minimal valid PNG fixture — no third-party media or permissions required.
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9uHAAAAABJRU5ErkJggg==",
            "base64",
          ),
        }),
      );
      await page.route("**/api/rentals/search", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results: [{
              ...rental,
              image: "/e2e-approved-rental.webp",
              can_schedule_viewing: false,
              schedule_viewing_url: null,
              tags: ["external-source", "not-verified"],
              source_url: "https://www.fincaraiz.com.co/example",
            }],
            total: 1,
            source: "mock",
          }),
        }),
      );
      await gotoDeterministicChat(page);
      const responsePromise = waitForPost(page, "/api/rentals/search");
      await typeAndSubmit(page, RENTAL_QUERY);
      expect((await responsePromise).ok()).toBe(true);

      const card = page.getByTestId("rental-card").first();
      await expect(card).toBeVisible();
      const photo = card.locator("img");
      await expect(photo).toBeVisible();
      await expect.poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      const imageBox = await photo.boundingBox();
      const cardBox = await card.boundingBox();
      expect(imageBox).not.toBeNull();
      expect(cardBox).not.toBeNull();
      expect(imageBox!.width).toBeGreaterThan(0);
      expect(imageBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
      expect(imageBox!.x + imageBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
      await expect(card.getByTestId("rental-schedule-cta")).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("a no-photo card shows no image or empty placeholder at 390px", async ({ page }) => {
    await page.setViewportSize(PHONE_390);
    await seedRentalPin(page);
    const card = page.getByTestId("rental-card").first();
    await expect(card.locator("img")).toHaveCount(0);
    await expect(card.getByText("Photo", { exact: true })).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });
});

// SAN-1075 — the viewing request is the end of the phone rental journey. iOS
// overlays the keyboard instead of shrinking the layout viewport, so a fixed
// modal keeps its Submit button behind the keys unless it reserves that inset.
test.describe("SAN-1075 viewing modal above the on-screen keyboard", () => {
  test.use({ viewport: PHONE_390, isMobile: true, hasTouch: true });

  test("keeps Submit reachable and every input at 16px while the keyboard overlays the page", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Model iOS: the layout viewport keeps its height and the keyboard covers
      // the bottom of the visual viewport.
      const listeners = new Set<EventListener>();
      let keyboardInset = 0;
      const fake = {
        get width() {
          return window.innerWidth;
        },
        get height() {
          return window.innerHeight - keyboardInset;
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
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        get: () => fake,
      });
      (
        window as unknown as { __setMdeKeyboardInset: (height: number) => void }
      ).__setMdeKeyboardInset = (height) => {
        keyboardInset = height;
        for (const listener of listeners) listener(new Event("resize"));
      };
    });

    await seedRentalPin(page);
    await page.getByTestId("rental-schedule-cta").first().tap();

    const modal = page.getByTestId("schedule-viewing-modal");
    await expect(modal).toBeVisible();
    const submit = page.getByTestId("schedule-viewing-submit");
    await expect(submit).toBeVisible();

    // iOS Safari auto-zooms any input below 16px, which makes the dialog
    // unusable before the renter can even read it.
    const fontSizes = await modal.locator("input").evaluateAll((inputs) =>
      inputs.map((input) => Number.parseFloat(getComputedStyle(input).fontSize)),
    );
    expect(fontSizes.length).toBe(4);
    expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(16);

    // A requested 320px keyboard is a real iPhone keyboard, not a 150px
    // browser-chrome change, so it must lift the dialog.
    await page.evaluate(() => {
      (
        window as unknown as { __setMdeKeyboardInset: (height: number) => void }
      ).__setMdeKeyboardInset(320);
    });

    const visualBottom = await page.evaluate(
      () => window.visualViewport?.height ?? window.innerHeight,
    );
    await expect
      .poll(
        async () => {
          const box = await submit.boundingBox();
          return box ? Math.round(box.y + box.height) : Number.POSITIVE_INFINITY;
        },
        { timeout: 5_000, message: "Submit above the overlaying keyboard" },
      )
      .toBeLessThanOrEqual(Math.round(visualBottom) + 1);
    await expectNoHorizontalOverflow(page);
  });
});

