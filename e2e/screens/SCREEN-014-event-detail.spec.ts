import { test, expect } from "@playwright/test";
import {
  assertConsoleClean,
  captureScreenEvidence,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  watchCriticalConsoleErrors,
} from "../helpers/screen-evidence";

const SCREEN_ID = "SCREEN-014";
const KNOWN_SLUG = "reina-de-antioquia-2026-finals";
const KNOWN_ID = "22222222-2222-2222-2222-000000000001";
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";

test.describe.configure({ mode: "serial" });

test.describe(`${SCREEN_ID} event detail page`, () => {
  test("curl published slug returns 200", async ({ request }) => {
    const res = await request.get(`${BASE}/events/${KNOWN_SLUG}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("event-detail-page");
  });

  test("curl draft/unknown slug returns 404", async ({ request }) => {
    const res = await request.get(`${BASE}/events/not-a-real-event-slug-404`);
    // Streamed Next.js notFound() can legitimately return 200 with noindex.
    // See https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes
    if (res.status() === 200) {
      expect(await res.text()).toContain("noindex");
    } else {
      expect(res.status()).toBe(404);
    }
  });

  test.describe("desktop", () => {
    test.use({ viewport: DESKTOP_VIEWPORT });

    test("client navigation shows loading skeleton before detail paint", async ({
      page,
    }) => {
      const errors = watchCriticalConsoleErrors(page);
      await page.goto("/events", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("event-details-cta").first()).toBeVisible({
        timeout: 15000,
      });

      await page.route("**/*", async (route) => {
        const req = route.request();
        const url = req.url();
        const isDetailFlight =
          url.includes(KNOWN_SLUG) &&
          (url.includes("_rsc") || req.resourceType() === "fetch");
        if (isDetailFlight) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
        await route.continue();
      });

      await page.getByTestId("event-details-cta").first().click();
      await expect(page.locator('[data-testid="event-detail-skeleton"]')).toBeVisible({
        timeout: 8000,
      });
      await expect(page.locator('[data-testid="event-detail-page"]')).toBeVisible({
        timeout: 15000,
      });
      assertConsoleClean(errors);
    });

    test("slug route shows host, venue, tiers and opens checkout modal", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await page.goto(`/events/${KNOWN_SLUG}`, { waitUntil: "domcontentloaded" });

      await expect(page.locator('[data-testid="event-detail-page"]')).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Reina de Antioquia",
      );

      const heroImg = page.locator('[data-testid="event-detail-page"] img');
      if ((await heroImg.count()) > 0) {
        const title = await page.getByRole("heading", { level: 1 }).first().textContent();
        await expect(heroImg.first()).toHaveAttribute("alt", title?.trim() ?? "");
        expect(title?.trim().length).toBeGreaterThan(0);
      }

      await expect(page.locator('[data-testid="event-host-block"]')).toBeVisible();
      await expect(page.locator('[data-testid="event-host-block"]')).toContainText(
        "Hosted by",
      );
      await expect(page.locator('[data-testid="event-venue-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="event-tier-row"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="event-tier-row"]')).toHaveCount(4);

      // The event title and ticket selector are together in the decision panel.
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByTestId("event-ticket-picker")).toBeVisible();

      await page.locator('[data-testid="event-tier-buy"]').first().click();
      await expect(page.locator('[data-testid="booking-checkout-modal"]')).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.locator('[data-testid="booking-checkout-modal"]')).toHaveCount(0);

      await captureScreenEvidence(page, SCREEN_ID, "desktop-event-detail.png");
      assertConsoleClean(errors);
    });

    test("UUID route resolves same event", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await page.goto(`/events/${KNOWN_ID}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid="event-detail-page"]')).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Reina de Antioquia",
      );
      assertConsoleClean(errors);
    });
  });

  // SAN-1486 — true SSR + hydration regression, not a formatter-only unit test.
  // The published fixture uses UTC 2026-10-19T21:00Z → 2026-10-20T02:00Z.
  // Across visitor time zones it must always display Oct 19, 4–9 PM Medellín.
  test.describe("Medellín event timezone hydration", () => {
    const eventPath = "/events/a1b2c3d4-0001-0001-0001-000000000006";
    const expectedSchedule = "Mon, Oct 19, 4:00 PM – 9:00 PM";

    for (const [device, viewport] of [
      ["desktop", DESKTOP_VIEWPORT],
      ["mobile", MOBILE_VIEWPORT],
    ] as const) {
      for (const timezoneId of ["UTC", "America/Bogota", "America/New_York"] as const) {
        test.describe(`${device} ${timezoneId}`, () => {
          // Reuse the normal Playwright page fixture so authenticated preview
          // storage state can be supplied without weakening deployment protection.
          test.use({ viewport, timezoneId });

          test("server HTML and hydrated date agree", async ({ page }) => {
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => {
              if (
                message.type() === "error" &&
                /hydration|react error #418|server rendered html/i.test(message.text())
              ) {
                errors.push(message.text());
              }
            });

            const response = await page.goto(eventPath, { waitUntil: "domcontentloaded" });
            expect(response?.status()).toBe(200);
            expect(await response!.text()).toContain(expectedSchedule);
            await expect(page.getByTestId("event-detail-page")).toBeVisible();
            await page.waitForLoadState("load");
            const schedule = page
              .getByTestId("event-detail-page")
              .locator("p:visible")
              .filter({ hasText: expectedSchedule });
            await expect(schedule).toHaveText(expectedSchedule);

            // Exercise a real navigation after hydration instead of fixed sleeps.
            // React mismatches on this page surface as page/console errors.
            await page.getByRole("link", { name: "Back to Events" }).click();
            await expect(page).toHaveURL(/\/events(?:[/?#]|$)/);
            expect(errors, `hydration errors on ${device}/${timezoneId}`).toEqual([]);
          });
        });
      }
    }
  });

  test.describe("mobile", () => {
    test.use({ viewport: MOBILE_VIEWPORT });

    test("sticky buy bar opens checkout modal", async ({ page }) => {
      const errors = watchCriticalConsoleErrors(page);
      await page.goto(`/events/${KNOWN_SLUG}`, { waitUntil: "domcontentloaded" });

      await expect(page.locator('[data-testid="event-host-block"]')).toBeVisible();
      await expect(page.locator('[data-testid="event-venue-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="event-detail-mobile-buy-bar"]')).toBeVisible();
      await page.locator('[data-testid="event-detail-mobile-buy-cta"]').click();
      await expect(page.locator('[data-testid="event-ticket-picker"]')).toBeFocused();
      await page.getByTestId("event-tier-buy").first().click();
      await expect(page.locator('[data-testid="booking-checkout-modal"]')).toBeVisible();

      await captureScreenEvidence(page, SCREEN_ID, "mobile-event-detail.png");
      assertConsoleClean(errors);
    });
  });
});
