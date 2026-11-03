import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  gotoDeterministicChat,
  mockFastPaths,
} from "./helpers/deterministic-chat";

const PHONE_390 = { width: 390, height: 844 };
const PHONE_360 = { width: 360, height: 800 };

/** Measure the settled rendered target, exactly as a thumb meets it. */
async function expectMinimumTouchTarget(locator: Locator, label: string) {
  await expect
    .poll(async () => (await locator.boundingBox())?.height ?? 0, {
      message: `${label} height must reach 44px`,
      timeout: 5_000,
    })
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => (await locator.boundingBox())?.width ?? 0, {
      message: `${label} width must reach 44px`,
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

/**
 * SAN-1075 — the first controls a phone renter meets are in the chat header.
 * A 17px text link and a 32px menu are below MDE's own 44px phone contract, and
 * "Sign up" used to wrap onto a second line at 390px.
 */
test.describe("SAN-1075 mobile chat header", () => {
  test.use({ viewport: PHONE_390, isMobile: true, hasTouch: true });

  test("menu and account actions are 44px and stay on one line", async ({ page }) => {
    await mockFastPaths(page);
    await gotoDeterministicChat(page);

    const menu = page.getByTestId("nav-drawer-trigger");
    const signIn = page.getByRole("link", { name: "Sign in" });
    const signUp = page.getByRole("link", { name: "Sign up" });
    await expect(signIn).toBeVisible();
    await expect(signUp).toBeVisible();

    await expectMinimumTouchTarget(menu, "navigation menu");
    await expectMinimumTouchTarget(signIn, "Sign in");
    await expectMinimumTouchTarget(signUp, "Sign up");

    const signInBox = await signIn.boundingBox();
    const signUpBox = await signUp.boundingBox();
    expect(signInBox).not.toBeNull();
    expect(signUpBox).not.toBeNull();
    const center = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(center(signInBox!) - center(signUpBox!))).toBeLessThanOrEqual(2);

    await expectNoHorizontalOverflow(page);

    // 360px is the narrowest certified phone; the same header must hold.
    await page.setViewportSize(PHONE_360);
    await expect(signIn).toBeVisible();
    await expect(signUp).toBeVisible();
    await expectMinimumTouchTarget(signIn, "Sign in at 360");
    await expectMinimumTouchTarget(signUp, "Sign up at 360");
    await expectNoHorizontalOverflow(page);
  });
});
