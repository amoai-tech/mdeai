import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * SAN-1416: on /rentals, a rental's Details open in the page (right column on desktop, a sheet on a
 * phone) instead of sending the visitor to the advertiser. Read-only: this spec clicks and reads,
 * it never submits anything.
 *
 * It runs on the real approved ads. If the page has no rental cards (an outage, or an empty
 * catalogue) it skips rather than failing, because there is nothing to open.
 */

const cards = (page: Page) => page.locator('[data-testid^="rental-card-"][data-result-kind="rental"]');

async function gotoRentals(page: Page) {
  await page.goto("/rentals", { waitUntil: "domcontentloaded" });
  const hasCards = await cards(page)
    .first()
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  // Against production (or any environment that must have the approved ads) set
  // E2E_REQUIRE_RENTAL_DATA=1: no cards is then a failure, not a silent skip.
  if (!hasCards && process.env.E2E_REQUIRE_RENTAL_DATA === "1") {
    throw new Error("E2E_REQUIRE_RENTAL_DATA=1 but /rentals showed no rental cards");
  }
  test.skip(!hasCards, "no rental cards on /rentals (outage or empty catalogue): nothing to open");
}

/**
 * The server-rendered button is visible before React attaches its handler, and under `next dev` the
 * page is re-created once shortly after first paint. Clicking scrolls the button into view, so just
 * retry the click until the Details actually open.
 */
async function openDetails(button: Locator, opened: Locator) {
  await expect(async () => {
    await button.click({ timeout: 2_000 });
    await expect(opened).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

/** The card's own id (its slug), so a locator survives the grid re-rendering. */
const detailsFor = (page: Page, slug: string) => page.getByTestId(`rental-details-cta-${slug}`);

/** Slug of the nth rental card, read from its test id (`rental-card-<slug>`). */
async function cardSlug(page: Page, index: number): Promise<string> {
  const testId = await cards(page).nth(index).getAttribute("data-testid");
  if (!testId) throw new Error(`rental card ${index} has no test id`);
  return testId.replace("rental-card-", "");
}

/**
 * SAN-1421: on a desktop the results column scrolls, not the page, so that is the scroll position to
 * compare. (The page itself must not scroll; the map and menu stay put.)
 */
const listScroll = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-testid="workspace-results-column"]')?.scrollTop ?? -1);

test.describe("/rentals Details — desktop 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("opens in the right column without leaving the page; Escape returns to the same search", async ({ page }) => {
    await gotoRentals(page);
    const total = await cards(page).count();
    const popups: string[] = [];
    page.on("popup", (popup) => popups.push(popup.url()));

    // A card well down the list: the panel must appear where the visitor is, not at the page top.
    const slug = await cardSlug(page, Math.min(6, total - 1));
    const button = detailsFor(page, slug);
    const panel = page.getByTestId("rental-details-panel");
    await openDetails(button, panel);
    const scrollWhenOpen = await listScroll(page);
    // A card well down the list means the column really has scrolled; 0 would make this check empty.
    if (total > 4) expect(scrollWhenOpen).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // In the page: same URL, no new tab.
    expect(new URL(page.url()).pathname).toBe("/rentals");
    expect(popups).toEqual([]);

    // What a renter needs, and nothing invented.
    await expect(page.getByTestId("rental-details-price")).toHaveText(/^COP [\d,]+\/mo$/);
    await expect(panel.locator("h2")).not.toBeEmpty();
    await expect(page.getByTestId("rental-details-schedule-cta")).toHaveCount(0);
    await expect(page.getByTestId("rental-details-external-note")).toContainText("cannot schedule a viewing");
    const source = page.getByTestId("rental-details-source-link");
    await expect(source).toHaveAttribute("href", /fincaraiz\.com\.co/);
    await expect(source).toHaveAttribute("target", "_blank");

    // Photos: the first one really loads.
    await expect
      .poll(() => panel.locator("img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);

    // The panel and its Close button are on screen and on top, and the page did not jump.
    const close = page.getByTestId("rental-details-close");
    const box = await close.boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= 900).toBe(true);
    await expect(close).toBeFocused();
    const topmost = await close.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el || el.contains(hit);
    });
    expect(topmost).toBe(true);

    // Escape closes; focus goes back to the button; the list, scroll and map are as they were.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();
    expect(await cards(page).count()).toBe(total);
    expect(Math.abs((await listScroll(page)) - scrollWhenOpen)).toBeLessThan(5);
    expect(new URL(page.url()).pathname).toBe("/rentals");
  });

  test("keyboard: Tab and Shift+Tab never land on the map behind the panel; Escape returns focus to the opener", async ({ page }) => {
    await gotoRentals(page);
    const slug = await cardSlug(page, 0);
    const opener = detailsFor(page, slug);
    await openDetails(opener, page.getByTestId("rental-details-panel"));
    await expect(page.getByTestId("rental-details-close")).toBeFocused();

    // The map is inert while Details is open, so no key press may focus anything inside it.
    const insideInert = () => page.evaluate(() => Boolean(document.activeElement?.closest("[inert]")));
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      expect(await insideInert(), `Tab press ${i + 1} focused something inside the inert map`).toBe(false);
    }
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await insideInert(), `Shift+Tab press ${i + 1} focused something inside the inert map`).toBe(false);
    }

    // From anywhere inside the panel, Escape closes it and focus goes back to the opener.
    await page.getByTestId("rental-details-close").focus();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("rental-details-panel")).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("an ad with no coordinates opens Details with no map link and no invented pin", async ({ page }) => {
    await gotoRentals(page);
    const unmapped = page.locator('[data-testid^="rental-card-"][data-result-kind="rental"]:not([data-pin-id])').first();
    test.skip((await unmapped.count()) === 0, "every listed ad has a pin right now");
    const slug = ((await unmapped.getAttribute("data-testid")) ?? "").replace("rental-card-", "");
    await openDetails(detailsFor(page, slug), page.getByTestId("rental-details-panel"));
    await expect(page.getByTestId("rental-details-no-location")).toBeVisible();
    await expect(page.getByTestId("rental-details-map-link")).toHaveCount(0);
    await expect(page.locator('[data-selected="true"]')).toHaveCount(0); // nothing selected: no pin to select
  });

  test("a card's title and photo open the same Details, and the title is not a link to the advertiser", async ({ page }) => {
    await gotoRentals(page);
    const slug = await cardSlug(page, 0);
    const title = page.getByTestId(`rental-card-link-${slug}`);
    expect(await title.evaluate((el) => el.tagName)).toBe("BUTTON");
    const panel = page.getByTestId("rental-details-panel");
    await openDetails(title, panel);
    await page.getByTestId("rental-details-close").click();
    await expect(panel).toBeHidden();
    await openDetails(page.getByTestId(`rental-card-photo-details-${slug}`), panel);
  });
});

test.describe("/rentals Details — phone 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens a sheet with a 44px Close, and Close returns to the same list", async ({ page }) => {
    await gotoRentals(page);
    const total = await cards(page).count();
    const button = detailsFor(page, await cardSlug(page, 0));
    const sheet = page.getByTestId("rental-details-sheet");
    await openDetails(button, sheet);

    await expect(sheet).toHaveAttribute("role", "dialog");
    await expect(page.getByTestId("rental-details-panel")).toHaveCount(0); // not the desktop panel
    await expect(page.getByTestId("rental-details-price")).toHaveText(/^COP [\d,]+\/mo$/);
    await expect(page.getByTestId("rental-details-schedule-cta")).toHaveCount(0);
    const close = page.getByTestId("rental-details-close");
    const box = await close.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await close.click();
    await expect(sheet).toBeHidden();
    expect(await cards(page).count()).toBe(total);
    expect(new URL(page.url()).pathname).toBe("/rentals");
  });
});


test.describe("/rentals workspace — laptop 1024px", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("results scroll independently while the map stays in place and cards fit", async ({ page }) => {
    await gotoRentals(page);
    const results = page.getByTestId("workspace-results-column");
    const map = page.getByTestId("browse-map-panel");
    const grid = page.getByTestId("rentals-grid");

    await expect(results).toBeVisible();
    await expect(map).toBeVisible();
    await expect(grid).toBeVisible();
    // A laptop's middle column is too narrow for two apartment cards.
    await expect.poll(() => grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length))
      .toBe(1);

    const before = await map.boundingBox();
    expect(before).not.toBeNull();
    // Scroll the results pane, not the outer page. A fixed map must not move.
    await results.evaluate((el) => { el.scrollTop = Math.min(400, el.scrollHeight - el.clientHeight); });
    await expect.poll(() => results.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const after = await map.boundingBox();
    expect(after).not.toBeNull();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const firstCard = await cards(page).first().boundingBox();
    const bounds = await results.boundingBox();
    expect(firstCard).not.toBeNull();
    expect(bounds).not.toBeNull();
    expect(firstCard!.width).toBeLessThanOrEqual(bounds!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});

test.describe("/rentals workspace — tablet 768px", () => {
  test.use({ viewport: { width: 768, height: 900 } });

  test("navigation opens and closes on a tablet without losing the results", async ({ page }) => {
    await gotoRentals(page);
    const count = await cards(page).count();
    const menu = page.getByTestId("nav-drawer-trigger");
    const drawer = page.getByTestId("nav-drawer-content");
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("nav-rentals-link")).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
    expect(await cards(page).count()).toBe(count);
    expect(new URL(page.url()).pathname).toBe("/rentals");
  });
});
