import { expect, test } from '@playwright/test';

/** Read-only browser proof. The persisted write/retry/cleanup owner is SAN-1205. */
const base = (process.env.PROD_SMOKE_BASE_URL ?? '').trim();
const start = '/rentals?neighborhood=Laureles&beds=2';
test.use({ viewport: { width: 390, height: 844 }, trace: 'off', video: 'off' });
test.describe('MDE Rentals phone: browse, map and viewing-form layout', () => {
  test.skip(!base, 'Requires explicit PROD_SMOKE_BASE_URL; never silently redirect local tests to production.');

  test('390px renter sees exact two-bedroom results and a non-submitted viewing form', async ({ page }) => {
    await page.goto(new URL(start, base).href, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('rentals-browse')).toBeVisible();
    const cards = page.locator('[data-testid="rentals-grid"] [data-result-kind="rental"][data-testid^="rental-card-"]');
    await expect.poll(() => cards.count(), { timeout: 30_000 }).toBeGreaterThan(0);
    for (const label of await cards.allInnerTexts()) expect(label).toMatch(/2\s*BR/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    const action = page.getByTestId('rental-schedule-cta').first();
    await expect(action).toBeVisible();
    await action.click();
    const modal = page.getByTestId('schedule-viewing-modal');
    await expect(modal.getByRole('dialog')).toBeVisible();
    await expect(modal.locator('input[name="name"]')).toBeVisible();
    await expect(modal.locator('input[name="email"]')).toBeVisible();
    await expect(modal.locator('input[name="preferredAt"]')).toBeVisible();
    // No Submit click, network write, or lead creation in this suite.
    const box = await modal.getByRole('dialog').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(await modal.locator('input[name="email"]').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('390px card/map pins stay grounded and the mobile map opens', async ({ page }) => {
    await page.goto(new URL(start, base).href, { waitUntil: 'domcontentloaded' });
    const cards = page.locator('[data-testid="rentals-grid"] [data-result-kind="rental"][data-testid^="rental-card-"]');
    await expect.poll(() => cards.count(), { timeout: 30_000 }).toBeGreaterThan(0);
    const fab = page.getByTestId('browse-map-fab');
    await expect(fab).toBeVisible();
    await fab.click();
    const map = page.getByRole('dialog', { name: 'Map view' });
    await expect(map).toBeVisible();
    await expect(map.getByTestId('chat-map')).toBeVisible();
    // No guessed location: the marker identities must come from currently rendered cards.
    const cardPins = (await cards.evaluateAll(els => els.map(el => el.getAttribute('data-pin-id')).filter(Boolean))).sort();
    // Google advanced markers mount asynchronously (usually ~2s after the sheet opens).
    // Query the page: the Google Maps marker portal can live outside the dialog node.
    await expect.poll(async () =>
      (await page.locator('[data-testid="map-pin"][data-pin-id]').evaluateAll(
        els => els.map(el => el.getAttribute('data-pin-id')).filter(Boolean),
      )).sort(), { timeout: 20_000 }).toEqual(cardPins);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});
