import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  gotoDeterministicChat,
  mockFastPaths,
  RENTAL_QUERY,
  typeAndSubmit,
  waitForPost,
} from "./helpers/deterministic-chat";

const PHONE_390 = { width: 390, height: 844 };
const PHONE_360_SHORT = { width: 360, height: 640 };
const LANDSCAPE = { width: 844, height: 390 };

/** Model iOS: the layout viewport keeps its height and the keyboard overlays the visual viewport. */
async function installKeyboardModel(page: Page) {
  await page.addInitScript(() => {
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
}

async function setKeyboard(page: Page, height: number) {
  await page.evaluate((value) => {
    (
      window as unknown as { __setMdeKeyboardInset: (height: number) => void }
    ).__setMdeKeyboardInset(value);
  }, height);
}

async function openViewingModal(page: Page) {
  await mockFastPaths(page);
  await gotoDeterministicChat(page);
  const responsePromise = waitForPost(page, "/api/rentals/search");
  await typeAndSubmit(page, RENTAL_QUERY);
  expect((await responsePromise).ok()).toBe(true);
  await expect(page.getByTestId("rental-card")).toHaveCount(1);
  await page.getByTestId("rental-schedule-cta").first().tap();
  const modal = page.getByTestId("schedule-viewing-modal");
  await expect(modal).toBeVisible();
  return modal;
}

async function expectInsideVisibleViewport(
  page: Page,
  locator: Locator,
  label: string,
) {
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        return box ? Math.round(box.y + box.height) : Number.POSITIVE_INFINITY;
      },
      { timeout: 5_000, message: `${label} above the overlaying keyboard` },
    )
    .toBeLessThanOrEqual(
      Math.round(
        (await page.evaluate(
          () => window.visualViewport?.height ?? window.innerHeight,
        )) + 1,
      ),
    );
}

test.describe("SAN-1075 viewing modal on a phone", () => {
  test.use({ viewport: PHONE_390, isMobile: true, hasTouch: true });

  test("focuses the first field, uses 16px inputs, and keeps Submit above the keyboard", async ({
    page,
  }) => {
    await installKeyboardModel(page);
    await openViewingModal(page);

    await expect(page.locator('input[name="name"]')).toBeFocused();

    for (const [label, action] of [
      ["Submit", page.getByTestId("schedule-viewing-submit")],
      ["Cancel", page.getByRole("button", { name: "Cancel" })],
    ] as const) {
      await expect
        .poll(async () => Math.round((await action.boundingBox())?.height ?? 0), {
          timeout: 5_000,
          message: `${label} is a 44px phone target`,
        })
        .toBeGreaterThanOrEqual(44);
    }

    const fontSizes = await page
      .getByTestId("schedule-viewing-modal")
      .locator("input")
      .evaluateAll((inputs) =>
        inputs.map((input) => Number.parseFloat(getComputedStyle(input).fontSize)),
      );
    expect(fontSizes.length).toBe(4);
    expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(16);

    await setKeyboard(page, 320);
    await expectInsideVisibleViewport(
      page,
      page.getByTestId("schedule-viewing-submit"),
      "Submit",
    );
  });

  test("rotation keeps the dialog and Submit inside the landscape viewport", async ({
    page,
  }) => {
    await openViewingModal(page);
    await page.setViewportSize(LANDSCAPE);

    const panel = page.getByTestId("schedule-viewing-modal").getByRole("dialog");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(LANDSCAPE.height + 1);

    const submit = page.getByTestId("schedule-viewing-submit");
    await submit.scrollIntoViewIfNeeded();
    await expectInsideVisibleViewport(page, submit, "Submit in landscape");
  });

  test("a short phone with a keyboard can still scroll to Submit", async ({ page }) => {
    await page.setViewportSize(PHONE_360_SHORT);
    await installKeyboardModel(page);
    await openViewingModal(page);

    await setKeyboard(page, 300);
    const submit = page.getByTestId("schedule-viewing-submit");
    await submit.scrollIntoViewIfNeeded();
    await expectInsideVisibleViewport(page, submit, "Submit on a short phone");
  });
});
