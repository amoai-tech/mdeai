import { test, expect, type Page } from "@playwright/test";
import { attachConsoleWatcher, gotoBrowseRoute } from "../helpers/venue-release";

/**
 * SAN-972 — Events three-panel workspace: navigation | events + Ask MDE | shared Google map.
 * Reads the real public catalog. Pins exist only for events with saved coordinates, so a catalog
 * with no located events skips the journey tests instead of faking a position.
 */

const shots = process.env.SAN972_SHOTS;

async function openEvents(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await gotoBrowseRoute(page, "/events");
  await expect(page.getByTestId("events-browse").first()).toBeVisible();
}

async function locatedCards(page: Page) {
  const cards = page.locator('[data-testid="event-card"][data-pin-id]');
  await expect(page.getByTestId("event-card").first()).toBeVisible();
  const count = await cards.count();
  test.skip(count === 0, "No published event has saved coordinates");
  return cards;
}

test.describe("SAN-972 /events map workspace", () => {
  test("desktop: navigation, events and map render together, one pin per located card", async ({ page }) => {
    const errors = attachConsoleWatcher(page);
    await openEvents(page, 1440, 900);
    const cards = await locatedCards(page);
    await expect(page.getByTestId("browse-map-panel")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Left navigation" })).toBeVisible();
    await expect(page.getByTestId("events-grid")).toBeVisible();
    // The real Google map mounted (not the e2e mock), and the pins match the located cards.
    await expect(page.getByTestId("browse-map-panel").locator(".gm-style").first()).toBeVisible({ timeout: 15_000 });
    // Real Google tiles, not just pins on an empty canvas.
    await expect(page.locator('.gm-style img[src*="googleapis"], .gm-style img[src*="gstatic"]').first()).toBeAttached({ timeout: 15_000 });
    const pins = page.getByTestId("browse-map-panel").getByTestId("map-pin");
    await expect(pins).toHaveCount(await cards.count());
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    if (shots) {
      await page.waitForTimeout(6_000); // let tiles paint before the evidence screenshot
      await page.screenshot({ path: `${shots}/events-1440.png` });
    }
    expect(errors.filter((e) => !/401|copilotkit/i.test(e))).toEqual([]);
  });

  test("card to map and map to card use the same event ID; Details and Back work", async ({ page }) => {
    await openEvents(page, 1440, 900);
    const cards = await locatedCards(page);
    const card = cards.first();
    const pinId = (await card.getAttribute("data-pin-id"))!;
    const slugHref = await card.getByTestId("event-details-cta").getAttribute("href");

    await card.getByTestId("event-map-select").click();
    await expect(card).toHaveAttribute("data-selected", "true");
    const overlay = page.getByTestId("browse-map-panel").getByTestId("selected-place-overlay");
    await expect(overlay).toHaveAttribute("data-pin-id", pinId, { timeout: 10_000 });
    await expect(page.getByTestId("browse-map-panel").locator(`[data-testid="map-pin"][data-pin-id="${pinId}"]`)).toHaveAttribute("data-marker-selected", "true");
    if (shots) await page.screenshot({ path: `${shots}/events-1440-selected.png` });

    // Map -> Details -> Back
    await overlay.getByTestId("selected-place-overlay-details").click();
    await expect(page).toHaveURL(new RegExp(`${slugHref}$`));
    await page.goBack();
    await expect(page.getByTestId("events-browse").first()).toBeVisible();

    // Map -> card: clicking another marker selects its matching card.
    const other = cards.nth((await cards.count()) > 1 ? 1 : 0);
    const otherId = (await other.getAttribute("data-pin-id"))!;
    await page.getByTestId("browse-map-panel").locator(`[data-testid="map-pin"][data-pin-id="${otherId}"]`).click();
    await expect(other).toHaveAttribute("data-selected", "true", { timeout: 10_000 });
  });

  test("Ask selection moves from event A to event B and clears", async ({ page }) => {
    await openEvents(page, 1440, 900);
    const asks = page.getByTestId("event-ask-select");
    test.skip((await asks.count()) < 2, "Needs two published events");
    await asks.nth(0).click();
    await expect(asks.nth(0)).toHaveAttribute("aria-pressed", "true");
    await asks.nth(1).click();
    await expect(asks.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(asks.nth(0)).toHaveAttribute("aria-pressed", "false");
    await asks.nth(1).click();
    await expect(asks.nth(1)).toHaveAttribute("aria-pressed", "false");
  });

  test("filters replace cards and pins together; an empty result drops the map instead of showing a blank one", async ({ page }) => {
    await openEvents(page, 1440, 900);
    await locatedCards(page);
    await expect(page.getByTestId("browse-map-panel")).toBeVisible();
    // The catalog has no sports event, so this filter has no results and so no pins.
    await page.getByTestId("events-filter-category-sport").click();
    await expect(page).toHaveURL(/category=sport/, { timeout: 15_000 });
    await expect(page.getByTestId("events-empty")).toBeVisible();
    await expect(page.getByTestId("browse-map-panel")).toHaveCount(0);
    await page.getByTestId("events-filter-clear").click();
    await expect(page.getByTestId("browse-map-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="event-card"][data-pin-id]').first()).toBeVisible();
  });

  test("phone: one column, map sheet opens, Escape closes it and focus returns to Map", async ({ page }) => {
    const errors = attachConsoleWatcher(page);
    await openEvents(page, 390, 844);
    await locatedCards(page);
    await expect(page.getByTestId("browse-map-panel")).toBeHidden();
    const fab = page.getByTestId("browse-map-fab");
    await expect(fab).toBeVisible();
    // Hydration can lag in dev; retry the open until the sheet is there.
    const dialog = page.getByRole("dialog", { name: "Map view" });
    await expect(async () => {
      if (!(await dialog.isVisible())) await fab.click();
      await expect(dialog).toBeVisible({ timeout: 1_500 });
    }).toPass();
    await expect(dialog.getByTestId("chat-map")).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}/events-390-map.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(fab).toBeFocused();
    const first = page.getByTestId("event-card").first();
    const box = await first.boundingBox();
    expect(box && box.width).toBeGreaterThan(250);
    if (shots) await page.screenshot({ path: `${shots}/events-390.png` });
    expect(errors.filter((e) => !/401|copilotkit/i.test(e))).toEqual([]);
  });

  for (const [width, height] of [[320, 700], [768, 1024], [1024, 768]] as const) {
    test(`${width}px: no horizontal overflow, CTAs stay inside their card`, async ({ page }) => {
      await openEvents(page, width, height);
      await expect(page.getByTestId("event-card").first()).toBeVisible();
      const bad = await page.evaluate(() => {
        const doc = document.documentElement;
        const out: string[] = [];
        if (doc.scrollWidth > doc.clientWidth) out.push("page overflow");
        for (const card of document.querySelectorAll('[data-testid="event-card"]')) {
          const c = card.getBoundingClientRect();
          for (const el of card.querySelectorAll("a,button")) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && (r.right > c.right + 1 || r.left < c.left - 1)) out.push(`clipped: ${el.textContent}`);
          }
        }
        return out;
      });
      expect(bad).toEqual([]);
    });
  }
});
