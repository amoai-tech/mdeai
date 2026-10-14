import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * SAN-1431 — local rental development preview.
 *
 * Local-only: requires a dev server started with MDE_DEV_RENTAL_PREVIEW=1 and
 * MDE_DEV_RENTAL_FIXTURES_DIR pointing at the research fixture. It is skipped
 * everywhere else, so it never runs against production or a CI server without
 * the private buckets/fixtures. Run it with:
 *
 *   MDE_DEV_RENTAL_PREVIEW=1 PW_SKIP_WEBSERVER=1 SMOKE_BASE_URL=http://127.0.0.1:3016 \
 *     npx playwright test e2e/screens/SAN-1431-local-rental-preview.spec.ts --project=chromium
 */
const PREVIEW_ENABLED = process.env.MDE_DEV_RENTAL_PREVIEW === "1";
const CARD = '[data-testid^="rental-card-candidate-"]';

async function expectImageLoaded(locator: Locator, label: string) {
  await expect
    .poll(
      async () => (await locator.evaluate((el) => (el as HTMLImageElement).naturalWidth)) ?? 0,
      { timeout: 20_000, message: `${label} must load its image bytes` },
    )
    .toBeGreaterThan(0);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        ),
      { timeout: 10_000, message: "no horizontal overflow" },
    )
    .toBe(true);
}

test.describe("SAN-1431 local rental preview — Supabase Storage photos", () => {
  test.skip(!PREVIEW_ENABLED, "Set MDE_DEV_RENTAL_PREVIEW=1 and run the local preview server");
  test.use({ viewport: { width: 1280, height: 900 } });

  test("shows nine candidates and loads their Storage photos", async ({ page }) => {
    const imageResponses: number[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/dev/rental-photo/")) imageResponses.push(response.status());
    });

    await page.goto("/dev/rentals", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dev-rentals-disclaimer")).toBeVisible();
    await expect(page.locator(CARD)).toHaveCount(9);
    await expectImageLoaded(page.locator(CARD).locator("img").first(), "first cover");
    await expect(page.getByRole("button", { name: /request viewing/i })).toHaveCount(0);
    expect(imageResponses.filter((status) => status === 200).length).toBeGreaterThan(0);
  });

  test("detail gallery shows four Storage photos and no viewing action", async ({ page }) => {
    await page.goto("/dev/rentals", { waitUntil: "domcontentloaded" });
    await page.locator(`${CARD} a[href^="/rentals/"]`).first().click();
    await expect(page.getByTestId("rental-detail")).toBeVisible();

    const gallery = page.getByTestId("rental-detail-gallery-desktop");
    await expect(gallery).toBeVisible();
    const photos = gallery.locator("img");
    await expect(photos).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expectImageLoaded(photos.nth(index), `gallery photo ${index + 1}`);
    }
    await expect(page.getByTestId("rental-detail-request-cta")).toHaveCount(0);
    await expect(page.getByTestId("rental-detail-ask-cta")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("creates no lead, viewing or booking request", async ({ page }) => {
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "GET") return;
      const url = request.url();
      if (/lead|viewing|schedule|booking|checkout/i.test(url)) {
        writes.push(`${request.method()} ${url}`);
      }
    });

    await page.goto("/dev/rentals", { waitUntil: "domcontentloaded" });
    await page.locator(`${CARD} a[href^="/rentals/"]`).first().click();
    await expect(page.getByTestId("rental-detail")).toBeVisible();
    await expect(page.getByTestId("rental-detail-gallery-desktop")).toBeVisible();

    expect(writes).toEqual([]);
  });
});

test.describe("SAN-1431 local rental preview — mobile 390px", () => {
  test.skip(!PREVIEW_ENABLED, "Set MDE_DEV_RENTAL_PREVIEW=1 and run the local preview server");
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("renders all nine cards without horizontal overflow", async ({ page }) => {
    await page.goto("/dev/rentals", { waitUntil: "domcontentloaded" });
    await expect(page.locator(CARD)).toHaveCount(9);
    await expectImageLoaded(page.locator(CARD).locator("img").first(), "mobile cover");
    await expectNoHorizontalOverflow(page);
  });

  test("swipes through all four gallery photos", async ({ page }) => {
    await page.goto("/dev/rentals", { waitUntil: "domcontentloaded" });
    await page.locator(`${CARD} a[href^="/rentals/"]`).first().click();
    await expect(page.getByTestId("rental-detail")).toBeVisible();

    const gallery = page.getByTestId("rental-detail-gallery-mobile");
    await expect(gallery).toBeVisible();
    await expect(gallery.locator('[data-slot="carousel-item"]')).toHaveCount(4);

    for (let index = 1; index <= 4; index += 1) {
      const slide = page.getByTestId(`rental-detail-slide-${index}`);
      await expect(slide).toBeInViewport();
      await expectImageLoaded(slide, `mobile gallery photo ${index}`);
      if (index < 4) {
        await gallery.getByRole("button", { name: "Next slide" }).click();
      }
    }
  });

  test("preview detail shows the preview notice, not a host-payment claim", async ({ page }) => {
    await page.goto("/dev/rentals", { waitUntil: "domcontentloaded" });
    await page.locator(`${CARD} a[href^="/rentals/"]`).first().click();
    await expect(page.getByTestId("rental-detail")).toBeVisible();
    const cta = page.getByTestId("rental-detail-mobile-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toContainText("Preview only — real inquiries disabled");
    await expect(cta).not.toContainText("Request only");
  });
});
