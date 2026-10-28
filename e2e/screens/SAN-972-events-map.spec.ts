import { test, expect, type Locator, type Page } from "@playwright/test";
import { attachConsoleWatcher, gotoBrowseRoute } from "../helpers/venue-release";

/**
 * SAN-972 — Events three-panel workspace: navigation | events + Ask MDE | shared Google map.
 * Reads the real public catalog. Pins exist only for events with saved coordinates, so a catalog
 * with no located events skips the journey tests instead of faking a position.
 */

const shots = process.env.SAN972_SHOTS;

/** Evidence screenshot without the dev-server-only overlays (CopilotKit inspector, Next.js dev badge). */
async function shoot(page: Page, name: string) {
  if (!shots) return;
  await page.addStyleTag({ content: "cpk-web-inspector, nextjs-portal { display: none !important; }" });
  // Map tiles fade in; capture only once two consecutive frames are identical.
  let previous = "";
  await expect
    .poll(async () => {
      const current = (await page.screenshot()).toString("base64");
      const settled = current === previous;
      previous = current;
      return settled;
    }, { intervals: [500], timeout: 20_000 })
    .toBe(true);
  await page.screenshot({ path: `${shots}/${name}.png` });
}

async function openEvents(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await gotoBrowseRoute(page, "/events");
  await expect(page.getByTestId("events-browse").first()).toBeVisible();
}

/** Click a toggle until it reports pressed: a click that lands before hydration is ignored. */
async function pressUntilOn(button: Locator) {
  await expect(async () => {
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass();
}

/** Scroll the last Details button into view and report whether something else sits on top of it. */
async function lastDetailsCovered(page: Page): Promise<string | false> {
  let covered: string | false = "not measured";
  // Retry: a dev-mode hydration pass can swap the button out from under the first attempt.
  await expect(async () => {
    const details = page.getByTestId("event-details-cta").last();
    await details.scrollIntoViewIfNeeded({ timeout: 2_000 });
    covered = await details.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top === el || el.contains(top)) return false;
      return `${top?.tagName.toLowerCase()}[${top?.getAttribute("data-testid") ?? top?.getAttribute("class")?.slice(0, 40)}] at ${Math.round(r.top)}px of ${innerHeight}`;
    });
  }).toPass();
  return covered;
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
      await shoot(page, "events-1440");
    }
    expect(errors.filter((e) => !/401|copilotkit/i.test(e))).toEqual([]);
  });

  test("card to map and map to card use the same event ID; Details and Back work", async ({ page }) => {
    await openEvents(page, 1440, 900);
    const cards = await locatedCards(page);
    const card = cards.first();
    const pinId = await card.getAttribute("data-pin-id");
    if (!pinId) throw new Error("located card has no pin id");
    const slugHref = await card.getByTestId("event-details-cta").getAttribute("href");

    await pressUntilOn(card.getByTestId("event-ask-select"));
    await expect(card).toHaveAttribute("data-selected", "true");
    const overlay = page.getByTestId("browse-map-panel").getByTestId("selected-place-overlay");
    await expect(overlay).toHaveAttribute("data-pin-id", pinId, { timeout: 10_000 });
    await expect(page.getByTestId("browse-map-panel").locator(`[data-testid="map-pin"][data-pin-id="${pinId}"]`)).toHaveAttribute("data-marker-selected", "true");
    await shoot(page, "events-1440-selected");

    // Map -> Details -> Back
    await overlay.getByTestId("selected-place-overlay-details").click();
    await expect(page).toHaveURL((url) => url.pathname === slugHref);
    await page.goBack();
    await expect(page.getByTestId("events-browse").first()).toBeVisible();

    // Map -> card: clicking another marker selects its matching card.
    const other = cards.nth((await cards.count()) > 1 ? 1 : 0);
    const otherId = await other.getAttribute("data-pin-id");
    if (!otherId) throw new Error("located card has no pin id");
    await page.getByTestId("browse-map-panel").locator(`[data-testid="map-pin"][data-pin-id="${otherId}"]`).click();
    await expect(other).toHaveAttribute("data-selected", "true", { timeout: 10_000 });
    // One selection: the Ask control follows the marker, and the previous card is released.
    await expect(other.getByTestId("event-ask-select")).toHaveAttribute("aria-pressed", "true");
    await expect(card).toHaveAttribute("data-selected", "false");
  });

  test("keyboard only: Enter and Space select an event; Tab and Shift+Tab move through the card in order", async ({ page }) => {
    await openEvents(page, 1440, 900);
    const cards = await locatedCards(page);
    const card = cards.first();
    const ask = card.getByTestId("event-ask-select");
    const details = card.getByTestId("event-details-cta");
    await expect(async () => {
      await ask.focus();
      await page.keyboard.press("Enter");
      await expect(card).toHaveAttribute("data-selected", "true", { timeout: 1_000 });
    }).toPass();
    await page.keyboard.press("Tab");
    await expect(details).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(ask).toBeFocused();
    await page.keyboard.press("Space"); // toggles off
    await expect(card).toHaveAttribute("data-selected", "false");
    // A visible focus indicator is drawn on the focused control.
    const ring = await ask.evaluate((el) => getComputedStyle(el).outlineStyle !== "none" || getComputedStyle(el).boxShadow !== "none");
    expect(ring).toBe(true);
  });

  test("Ask selection moves from event A to event B and clears, and the marker selection follows", async ({ page }) => {
    await openEvents(page, 1440, 900);
    const asks = page.getByTestId("event-ask-select");
    test.skip((await asks.count()) < 2, "Needs two published events");
    await pressUntilOn(asks.nth(0));
    await pressUntilOn(asks.nth(1));
    await expect(asks.nth(0)).toHaveAttribute("aria-pressed", "false");
    const selectedPins = page.locator('[data-testid="map-pin"][data-marker-selected="true"]');
    const located = (await page.locator('[data-testid="event-card"][data-pin-id]').count()) >= 2;
    if (located) await expect(selectedPins).toHaveCount(1);
    await asks.nth(1).click();
    await expect(asks.nth(1)).toHaveAttribute("aria-pressed", "false");
    if (located) await expect(selectedPins).toHaveCount(0);
  });

  test("a filter with no results drops the map; Clear brings cards and pins back (independent of catalog contents)", async ({ page }) => {
    await openEvents(page, 1440, 900);
    await locatedCards(page);
    await expect(page.getByTestId("browse-map-panel")).toBeVisible();
    // A neighborhood that cannot exist matches nothing whatever events are published.
    await page.goto("/events?neighborhood=zz-no-such-neighborhood-972");
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
    await shoot(page, "events-390-map");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(fab).toBeFocused();
    const first = page.getByTestId("event-card").first();
    const box = await first.boundingBox();
    expect(box?.width).toBeGreaterThan(250);
    await shoot(page, "events-390");
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

  // Real browser zoom shrinks the CSS viewport and raises the pixel ratio. 400% zoom of a 1280x1024
  // window is 320x256 CSS px at 4x; 200% is 640x512 at 2x. Cards must stay reachable and un-clipped.
  for (const [zoom, width, height] of [["200%", 640, 512], ["400%", 320, 256]] as const) {
    test(`${zoom} zoom: no horizontal scroll; Details stays reachable and is not covered by the pinned Ask bar`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1280 / width });
      const page = await context.newPage();
      await gotoBrowseRoute(page, "/events");
      await expect(page.getByTestId("events-browse").first()).toBeVisible();
      await expect(page.getByTestId("event-card").first()).toBeVisible();
      const covered = await lastDetailsCovered(page);
      expect(covered, "something covers the last Details button at this zoom").toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      await context.close();
    });
  }

  test("phone with the on-screen keyboard open (short viewport): Ask input stays usable and Details is still reachable", async ({ page }) => {
    // A phone keyboard takes roughly half the screen; the visual viewport shrinks accordingly.
    await openEvents(page, 390, 420);
    const input = page.getByTestId("workspace-ask-composer").getByRole("textbox").first();
    await input.focus();
    await expect(input).toBeFocused();
    const covered = await lastDetailsCovered(page);
    expect(covered, "something covers Details while the keyboard is open").toBe(false);
  });
});
