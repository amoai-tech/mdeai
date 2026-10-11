import { test, expect } from "@playwright/test";
import {
  collectCriticalConsoleErrors,
  ensureChatInputVisible,
  gotoHome,
  RENTAL_QUERY,
  sendConciergeMessage,
  waitForRentalCards,
} from "./helpers/maps-layout";

test.describe("MAP-007B mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("chat input visible before and after map sheet", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await gotoHome(page);
    await ensureChatInputVisible(page);

    const input = page.getByRole("textbox", { name: /type a message/i });
    await expect(input).toBeVisible();

    const send = page.getByRole("button", { name: /^send$/i });
    const sendBox = await send.boundingBox();
    const fab = page.locator('[data-testid="map-sheet-trigger"]');
    const fabBox = await fab.boundingBox();
    expect(sendBox).not.toBeNull();
    expect(fabBox).not.toBeNull();
    if (sendBox && fabBox) {
      expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(sendBox.y + 4);
    }

    await fab.click();
    await expect(page.locator('[data-testid="map-sheet-content"]')).toBeVisible();
    // The desktop panel keeps an unrendered wrapper in the DOM on a phone; exactly one map is visible.
    await expect(page.locator('[data-testid="chat-map"]:visible')).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="map-sheet-content"]')).toBeHidden({
      timeout: 10_000,
    });

    await expect(input).toBeVisible();

    expect(collectCriticalConsoleErrors(errors)).toEqual([]);
  });

  // SAN-524 — production finding: with focus inside Google Maps the map consumes Escape (it handles
  // keys on its own container and stops them), so the sheet stayed open although it says "Escape
  // closes this sheet". The test mock map has no keyboard handling, so this models that behavior:
  // a focusable element inside the map whose container stops every keydown from bubbling.
  test("Escape closes the map sheet even when focus is inside the map and the map swallows the key", async ({ page }) => {
    await gotoHome(page);
    await ensureChatInputVisible(page);

    const trigger = page.locator('[data-testid="map-sheet-trigger"]');
    await trigger.click();
    const sheet = page.locator('[data-testid="map-sheet-content"]');
    await expect(sheet).toBeVisible();

    await page.evaluate(() => {
      const map = document.querySelector('[data-testid="map-sheet-content"] [data-testid="chat-map"]');
      if (!map) throw new Error("no map in the sheet");
      const inner = document.createElement("div");
      inner.tabIndex = 0;
      inner.setAttribute("data-testid", "map-focus-target");
      map.appendChild(inner);
      // What Google Maps does with keys: handle them on the map container and stop them there.
      map.addEventListener("keydown", (event) => event.stopPropagation());
      inner.focus();
    });
    await expect(page.getByTestId("map-focus-target")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 10_000 });
    // Focus returns to the control that opened the sheet, so the keyboard user is not stranded.
    await expect(trigger).toBeFocused();
  });

  test("Escape does nothing to the map sheet when it is not open", async ({ page }) => {
    await gotoHome(page);
    await ensureChatInputVisible(page);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="map-sheet-content"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="map-sheet-trigger"]')).toBeVisible();
  });

  test("rental search shows cards in center chat", async ({ page }) => {
    await gotoHome(page);
    await sendConciergeMessage(page, RENTAL_QUERY);
    await waitForRentalCards(page);
    await expect(page.locator('[data-testid="center-chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-rail"]:visible')).toHaveCount(0);
  });
});

test.describe("MAP-007B tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("center chat and map sheet trigger", async ({ page }) => {
    await gotoHome(page);
    await expect(page.locator('[data-testid="chat-canvas"]')).toBeVisible();
    await expect(page.locator('[data-testid="center-chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="map-sheet-trigger"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-drawer-trigger"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-rail"]:visible')).toHaveCount(0);
  });
});
