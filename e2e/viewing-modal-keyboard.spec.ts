import { test, expect, type Locator, type Page } from "@playwright/test";
import { chooseViewingDateTime, advanceViewingReview } from "./helpers/viewing-date-picker";
import { nextMedellinTestViewingWallClock } from "@/lib/leads/schedule-viewing-time";
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

  test("desktop calendar and review fit without changing the listing", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const modal = await openViewingModal(page);
    const before = page.url();
    await modal.locator('input[name="name"]').fill("Camila Test");
    await modal.locator('input[name="email"]').fill("camila@example.com");
    await chooseViewingDateTime(page, nextMedellinTestViewingWallClock());
    const box = await modal.getByRole("dialog").boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(530);
    expect(box?.height ?? 0).toBeLessThanOrEqual(900);
    await advanceViewingReview(page);
    await expect(modal.getByTestId("schedule-viewing-review")).toContainText("Camila Test");
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toBeHidden();
    expect(page.url()).toBe(before);
  });

  test("calendar → review → edit → cancel makes no API write", async ({ page }) => {
    let writes = 0;
    await page.route("**/api/leads/schedule-viewing", async (route) => {
      writes++;
      await route.fulfill({ status: 500, body: "Unexpected request before confirmation" });
    });
    const modal = await openViewingModal(page);
    await expect(modal.getByTestId("viewing-date-selection")).toContainText("No date selected");
    await expect(modal.getByTestId("viewing-time")).toBeVisible();
    await chooseViewingDateTime(page, nextMedellinTestViewingWallClock());
    await modal.locator('input[name="name"]').fill("Camila Test");
    await modal.locator('input[name="email"]').fill("camila@example.com");
    await advanceViewingReview(page);
    await expect(modal.getByTestId("schedule-viewing-review")).toContainText("Camila Test");
    expect(writes).toBe(0);
    await modal.getByTestId("schedule-viewing-edit").click();
    await expect(modal.locator('input[name="name"]')).toHaveValue("Camila Test");
    await advanceViewingReview(page);
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toBeHidden();
    expect(writes).toBe(0);
  });

  test("explicit final request shows receipt only after both IDs are acknowledged", async ({ page }) => {
    let writes = 0;
    await page.route("**/api/leads/schedule-viewing", async (route) => {
      writes++;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        success: true,
        leadId: "11111111-1111-1111-1111-000000000001",
        showingId: "22222222-2222-2222-2222-000000000002",
        message: "Viewing request received — awaiting host confirmation.",
      }) });
    });
    const modal = await openViewingModal(page);
    await modal.locator('input[name="name"]').fill("Camila Test");
    await modal.locator('input[name="email"]').fill("camila@example.com");
    await chooseViewingDateTime(page, nextMedellinTestViewingWallClock());
    await advanceViewingReview(page);
    expect(writes).toBe(0);
    await modal.getByTestId("schedule-viewing-submit").click();
    await expect(modal).toBeHidden();
    await expect(page.getByTestId("lead-confirmation-card")).toContainText("awaiting host confirmation");
    expect(writes).toBe(1);
  });

  test("focuses the first field, uses 16px inputs, and keeps Review above the keyboard", async ({
    page,
  }) => {
    await installKeyboardModel(page);
    await openViewingModal(page);

    await expect(page.locator('input[name="name"]')).toBeFocused();

    for (const [label, action] of [
      ["Review", page.getByTestId("schedule-viewing-review-button")],
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
      page.getByTestId("schedule-viewing-review-button"),
      "Review",
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

    const submit = page.getByTestId("schedule-viewing-review-button");
    await submit.scrollIntoViewIfNeeded();
    await expectInsideVisibleViewport(page, submit, "Review in landscape");
  });

  // DayPicker returns the clicked cell as a browser-local calendar Date. We persist its
  // year/month/day components as a listing-local date-only string; interpreting the instant
  // through the Bogotá timezone would incorrectly shift midnight on users' other devices.
  for (const timezoneId of ["Europe/Madrid", "America/New_York"] as const) {
    test.describe(`calendar choice in ${timezoneId}`, () => {
      test.use({ timezoneId });
      test("preserves the clicked calendar day as the Medellín viewing day", async ({ page }) => {
        const modal = await openViewingModal(page);
        const slot = nextMedellinTestViewingWallClock();
        const [chosenDate] = slot.split("T");
        await modal.locator('input[name="name"]').fill("Camila Test");
        await modal.locator('input[name="email"]').fill("camila@example.com");
        await chooseViewingDateTime(page, slot);
        await expect(modal.getByTestId("viewing-date-selection")).toContainText(chosenDate);
        await advanceViewingReview(page);
        await expect(modal.getByTestId("schedule-viewing-review")).toContainText(chosenDate);
      });
    });
  }

  test("a short phone with a keyboard can still scroll to Submit", async ({ page }) => {
    await page.setViewportSize(PHONE_360_SHORT);
    await installKeyboardModel(page);
    await openViewingModal(page);

    await setKeyboard(page, 300);
    const submit = page.getByTestId("schedule-viewing-review-button");
    await submit.scrollIntoViewIfNeeded();
    await expectInsideVisibleViewport(page, submit, "Review on a short phone");
  });
});
