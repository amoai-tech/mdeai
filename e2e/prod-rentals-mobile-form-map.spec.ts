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
    await expect(modal.getByTestId('viewing-time')).toBeVisible();
    // No Submit click, network write, or lead creation in this suite.
    const box = await modal.getByRole('dialog').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(await modal.locator('input[name="email"]').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('390px stale viewing offers Refresh results without retrying and preserves filters', async ({ page }) => {
    // The browser exercises the actual modal and calendar; interception guarantees this
    // regression never writes a real viewing request to the production backend.
    let writeAttempts = 0;
    await page.route('**/api/leads/schedule-viewing', async (route) => {
      writeAttempts += 1;
      await route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'LISTING_UNRESOLVABLE',
            message: "This listing is no longer available. Refresh the results to see what's still here.",
          },
        }),
      });
    });

    await page.goto(new URL(start, base).href, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('rentals-browse')).toBeVisible();
    // The grid renders before its cards do; clicking the first CTA while the skeletons are
    // still up is a timeout waiting to happen.
    const staleCards = page.locator('[data-testid="rentals-grid"] [data-result-kind="rental"][data-testid^="rental-card-"]');
    await expect.poll(() => staleCards.count(), { timeout: 30_000 }).toBeGreaterThan(0);
    await page.getByTestId('rental-schedule-cta').first().click();
    const modal = page.getByTestId('schedule-viewing-modal');
    await expect(modal.getByRole('dialog')).toBeVisible();
    await modal.locator('input[name="name"]').fill('Stale Viewing QA');
    await modal.locator('input[name="email"]').fill('stale-viewing-no-write@example.com');

    // The viewing date is a custom DayPicker, not a native <input type="date">.
    // Choose the 15th of next month so the requested time is always in the future.
    await modal.getByTestId('viewing-date-trigger').click();
    const calendar = modal.getByTestId('viewing-date-calendar');
    await calendar.getByRole('button', { name: 'Go to the Next Month' }).click();
    // react-day-picker sets data-day to the full ISO date (day.isoDate, e.g. 2026-06-15), so
    // anchor on the attribute suffix instead of the button's text or aria-label.
    await calendar.locator('button[data-day$="-15"]:not([disabled])').click();
    await modal.getByTestId('viewing-time').fill('15:00');
    await modal.getByTestId('schedule-viewing-review-button').click();
    await expect(modal.getByTestId('schedule-viewing-review')).toBeVisible();
    await modal.getByTestId('schedule-viewing-submit').click();

    await expect(modal.getByTestId('schedule-viewing-error')).toContainText('This listing is no longer available');
    const refresh = modal.getByTestId('schedule-viewing-refresh-results');
    await expect(refresh).toBeVisible();
    await expect(refresh).toHaveAttribute('href', start);
    await expect(modal.getByTestId('schedule-viewing-retry')).toHaveCount(0);
    await expect(modal.getByTestId('schedule-viewing-submit')).toHaveCount(0);
    await expect(modal.getByTestId('schedule-viewing-edit')).toHaveCount(0);
    expect(writeAttempts).toBe(1);

    await refresh.click();
    await expect(page).toHaveURL(new URL(start, base).href);
    await expect(page.getByTestId('rentals-browse')).toBeVisible();
    expect(writeAttempts).toBe(1);
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
