import { test, expect } from "@playwright/test";

/**
 * SAN-478 — the browse-card "Schedule viewing" button must open the viewing modal in place.
 *
 *   RENTALS_BROWSE_E2E=1 PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1 \
 *     npx playwright test e2e/san-478-browse-schedule-cta.spec.ts --project=chromium
 *
 * The defect this pins: the card called `window.open("…/rentals/<id>/schedule-viewing")`,
 * a route no build has ever served, so a renter who clicked the CTA landed on a 404 tab
 * while the detail page worked. Asserting "a button with the right test id exists" cannot
 * catch that — the old code also rendered that button. So this spec asserts the *effect*:
 * the modal appears and nothing is opened in a new tab.
 *
 * Opt-in behind RENTALS_BROWSE_E2E so it never fires from an ordinary `test:e2e` run.
 * When opted in it FAILS LOUDLY if the target has no requestable listing — an absent CTA
 * would otherwise be indistinguishable from a passing test.
 */

const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const enabled = process.env.RENTALS_BROWSE_E2E === "1" && baseUrl.length > 0;

const CTA = '[data-testid="rental-schedule-cta"]';
const MODAL = '[data-testid="schedule-viewing-modal"]';

const route = (p: string) => new URL(p, `${baseUrl}/`).toString();

test.describe("SAN-478 · browse-card schedule viewing", () => {
  test.skip(!enabled, "Set RENTALS_BROWSE_E2E=1 and PROD_SMOKE_BASE_URL");

  test("opens the modal in place and never a new tab", async ({ page }) => {
    test.setTimeout(180_000);

    // Capture every window.open from the first script, before any app code runs.
    await page.addInitScript(() => {
      const w = window as unknown as { __openedUrls: string[]; open: typeof window.open };
      w.__openedUrls = [];
      const original = w.open.bind(window);
      w.open = ((...args: unknown[]) => {
        w.__openedUrls.push(String(args[0]));
        return original(...(args as Parameters<typeof window.open>));
      }) as typeof window.open;
    });

    await page.goto(route("/rentals?neighborhood=Laureles"), {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator('[data-testid="rentals-browse"]')).toBeVisible({
      timeout: 60_000,
    });

    const cta = page.locator(CTA).filter({ visible: true });
    await expect(
      cta,
      "no requestable listing on this target — the CTA would be absent, so this proof " +
        "cannot run. Seed or publish a requestable listing rather than accepting a skip.",
    ).toHaveCount(1, { timeout: 60_000 });

    // The card must not carry the dead route anywhere in its markup or hrefs.
    const cardHtml = await page.locator('[data-testid="rentals-grid"]').innerHTML();
    expect(cardHtml, "SAN-478: the dead /schedule-viewing path must not be rendered").not.toContain(
      "/schedule-viewing",
    );

    // The card is server-rendered inside a client component: retry the click until the
    // dependent surface appears, because an early click is silently dropped pre-hydration.
    const modal = page.locator(MODAL);
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (await modal.isVisible().catch(() => false)) break;
      await cta.click({ timeout: 10_000 }).catch(() => {});
      if (
        await modal
          .waitFor({ state: "visible", timeout: 3_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        break;
      }
    }

    await expect(
      modal,
      "SAN-478: clicking the browse-card CTA must open the viewing modal",
    ).toBeVisible({ timeout: 30_000 });

    const opened = await page.evaluate(
      () => (window as unknown as { __openedUrls: string[] }).__openedUrls,
    );
    expect(
      opened,
      "SAN-478: the CTA must not open a new tab — that was the 404",
    ).toEqual([]);

    // Sanity: no 404 was navigated to as part of this interaction.
    expect(page.url()).not.toContain("/schedule-viewing");
  });
});
