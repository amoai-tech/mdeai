/**
 * SAN-1688 · the rental listing preview and the listing form at real viewport sizes.
 *
 *   PLAYWRIGHT_WEB_SERVER_COMMAND="npm run dev:ui:worktree" SMOKE_BASE_URL=http://localhost:3002 \
 *     npx playwright test e2e/san-1688-rentals-preview-responsive.spec.ts --project=chromium
 *
 * Proof this file owns:
 * - no horizontal overflow at 1440 / 768 / 390 / 320;
 * - the form buttons stay visible and are not covered by the preview;
 * - an allowlisted https photo goes through the Next.js image optimiser and decodes;
 * - a photo that cannot load degrades to a labelled placeholder with a retry;
 * - half bathrooms are blocked by the form, never rounded into a property fact;
 * - the preview follows the broker from Listing to Review;
 * - keyboard order still reaches every listing field.
 *
 * The photo responses are fulfilled locally so the proof is deterministic: an
 * external CDN timing out must not turn this regression test red. The optimiser
 * request URL is asserted, so the media configuration is still exercised.
 */
import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getTestSession,
  hasE2eEnv,
  injectSession,
  type ThrowawayIdentity,
} from "./helpers/auth";

const REAL_PHOTO = "https://picsum.photos/seed/san1688-preview/800/600";
const BROKEN_PHOTO = "https://example.com/mde-san-1688-missing-photo.jpg";
/** A real 320x200 PNG committed with the spec: deterministic and visibly a photo. */
const PHOTO_FIXTURE = "e2e/fixtures/san-1688-photo.png";

type ViewportCase = { name: string; width: number; height: number; touch: boolean };

const VIEWPORTS: ViewportCase[] = [
  { name: "1440-desktop", width: 1440, height: 900, touch: false },
  { name: "768-tablet", width: 768, height: 900, touch: true },
  { name: "390-phone", width: 390, height: 844, touch: true },
  { name: "320-small-phone", width: 320, height: 720, touch: true },
];

// Authenticated journeys never persist browser artifacts (worker-scoped options).
test.use({ screenshot: "off", trace: "off", video: "off" });

test.describe("SAN-1688 · rental listing preview across viewports", () => {
  test("broker completes the listing step with a truthful preview at 1440/768/390/320", async ({
    browser,
  }, testInfo) => {
    test.skip(!hasE2eEnv(), "E2E Supabase env missing");
    test.setTimeout(300_000);

    const identity: ThrowawayIdentity = await createThrowawayIdentity("san1688-preview");
    try {
      const session = await getTestSession(identity.email);
      const optimiserRequests: string[] = [];

      for (const viewport of VIEWPORTS) {
        const optimizerRequestsForViewport: string[] = [];
        const context: BrowserContext = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          hasTouch: viewport.touch,
          isMobile: viewport.touch,
        });
        try {
          await injectSession(context, session);
          const page = await context.newPage();
          await page.route("**/api/places/search**", (route) =>
            route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ results: [] }),
            }),
          );
          await page.route("**/_next/image**", async (route) => {
            const url = route.request().url();
            if (!url.includes("picsum.photos")) return route.fallback();
            optimizerRequestsForViewport.push(url);
            await route.fulfill({
              status: 200,
              contentType: "image/png",
              path: PHOTO_FIXTURE,
            });
          });
          await page.route("https://example.com/**", (route) => route.abort("failed"));

          await verifyPreviewAndPhoto(page, viewport, optimizerRequestsForViewport, testInfo);
          await verifyInvalidPhotoAndBathrooms(page, viewport, testInfo);
          await verifyReviewAndKeyboard(page, viewport, testInfo);
          optimiserRequests.push(...optimizerRequestsForViewport);
        } finally {
          await context.close();
        }
      }

      // Four viewports, at least four optimiser requests: the photo path is never skipped.
      expect(optimiserRequests.length).toBeGreaterThanOrEqual(VIEWPORTS.length);
    } finally {
      await deleteThrowawayIdentity(identity);
    }
  });
});

async function verifyPreviewAndPhoto(
  page: Page,
  viewport: ViewportCase,
  optimizerRequestsForViewport: string[],
  testInfo: TestInfo,
) {
  await openListingStep(page);
  await expectNoHorizontalOverflow(page, `${viewport.name} empty listing`);

  // Missing data is labelled, never invented.
  await expect(page.getByTestId("ro-live-preview-price")).toHaveText("Add monthly rent");
  await expect(page.getByTestId("ro-live-preview-location")).toHaveText(
    "Add street address",
  );
  await expect(page.getByTestId("ro-live-preview-place-status")).toContainText(
    "Location not confirmed",
  );

  await fillListing(page, { photo: REAL_PHOTO });
  await expect(page.getByTestId("ro-live-preview-price")).toContainText("COP 2,400,000");
  await expect(page.getByTestId("ro-live-preview-bathrooms")).toHaveText("1");
  await expectNoHorizontalOverflow(page, `${viewport.name} filled listing`);
  await expectButtonUncovered(page, viewport.name);

  // The allowlisted host goes through the Next.js optimiser, and the image decodes.
  await expect
    .poll(() => optimizerRequestsForViewport.length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  expect(optimizerRequestsForViewport[0]).toContain(
    encodeURIComponent("https://picsum.photos/seed/san1688-preview/800/600"),
  );
  const photo = page.getByTestId("ro-live-preview-photo");
  await expect(photo).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () =>
        photo.evaluate((element) =>
          element instanceof HTMLImageElement
            ? element.complete && element.naturalWidth > 0 && element.naturalHeight > 0
            : false,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(page.getByTestId("ro-live-preview-photo-loading")).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath(`san-1688-${viewport.name}-listing-with-photo.png`),
    fullPage: true,
  });

}

async function verifyInvalidPhotoAndBathrooms(
  page: Page,
  viewport: ViewportCase,
  testInfo: TestInfo,
) {
  // A broken image degrades to a labelled placeholder with an explicit retry.
  await page.locator("#ro-photo").fill(BROKEN_PHOTO);
  await expect(page.getByTestId("ro-live-preview-photo-status")).toContainText(
    "Photo unavailable",
    { timeout: 15_000 },
  );
  await expect(page.getByTestId("ro-live-preview-photo-retry")).toBeVisible();
  await expect(page.getByTestId("ro-live-preview-photo-status")).not.toContainText(
    "verified",
  );

  // Half a bathroom is rejected by the form; apartments.bathrooms is an integer.
  await page.locator("#ro-bathrooms").fill("1.5");
  await expect(page.getByTestId("ro-bathrooms-error")).toContainText("whole number");
  await expect(continueButton(page)).toBeDisabled();
  await expect(page.getByTestId("ro-live-preview-bathrooms")).toHaveText("Not specified");
  await expectNoHorizontalOverflow(page, `${viewport.name} invalid bathrooms`);

  await page.screenshot({
    path: testInfo.outputPath(`san-1688-${viewport.name}-invalid-bathrooms.png`),
    fullPage: true,
  });

  await page.locator("#ro-bathrooms").fill("2");
  // Restore a usable photo so the Review evidence shows the happy path.
  await page.locator("#ro-photo").fill(REAL_PHOTO);
  await expect(continueButton(page)).toBeEnabled();

}

async function verifyReviewAndKeyboard(
  page: Page,
  viewport: ViewportCase,
  testInfo: TestInfo,
) {
  // Keyboard order: every listing field is reachable without a pointer.
  await page.locator("#ro-address").focus();
  const order: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    await page.keyboard.press("Tab");
    order.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement
          ? active.id || active.textContent?.trim() || "?"
          : "?";
      }),
    );
  }
  expect(order).toEqual(["ro-bedrooms", "ro-bathrooms", "ro-rent", "ro-photo"]);

  // Click/tap both reach Review, where the preview follows the broker.
  await continueButton(page).click({ timeout: 15_000 });
  await expect(page.locator('[data-testid="ro-step-review"]')).toBeVisible();
  await expect(page.locator('[data-testid="ro-live-preview"]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page, `${viewport.name} review`);
  await expect(page.getByTestId("ro-submit")).toBeVisible();
  // The preview remounts on Review; wait for the photo to decode before the
  // evidence screenshot so it shows the real state, not a loading frame.
  const reviewPhoto = page.getByTestId("ro-live-preview-photo");
  await expect
    .poll(
      async () =>
        reviewPhoto.evaluate((element) =>
          element instanceof HTMLImageElement
            ? element.complete && element.naturalWidth > 0
            : false,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);

  await page.screenshot({
    path: testInfo.outputPath(`san-1688-${viewport.name}-review.png`),
    fullPage: true,
  });
}

async function openListingStep(page: Page) {
  await page.goto("/host/rentals/onboarding", { waitUntil: "domcontentloaded" });
  // The CopilotKit inspector is a fixed dev overlay on host pages when present.
  await page.addStyleTag({ content: "#cpk-web-inspector { display: none !important; }" });
  await expect(page.locator('[data-testid="rentals-onboarding"]')).toBeVisible();

  // The wizard is a client component: typing or clicking before React hydration is
  // discarded, which leaves Continue disabled forever. Drive the two step-1 facts
  // until React's own state enables the button, then navigate.
  const button = page
    .locator('[data-testid="ro-step-profile"]')
    .getByRole("button", { name: /Continue/ });
  const laureles = page.getByRole("button", { name: "Laureles", exact: true });
  await expect
    .poll(
      async () => {
        await page.locator("#ro-display-name").fill("QA Broker Preview").catch(() => undefined);
        const classes = (await laureles.getAttribute("class")) ?? "";
        if (!classes.includes("bg-primary")) {
          await laureles.click({ timeout: 2_000 }).catch(() => undefined);
        }
        return button.isEnabled();
      },
      { timeout: 30_000, intervals: [250, 500, 1_000, 2_000] },
    )
    .toBe(true);
  await button.click({ timeout: 15_000 });
  await expect(page.locator('[data-testid="ro-step-listing"]')).toBeVisible();
}

async function fillListing(
  page: Page,
  values: { address?: string; bedrooms?: string; bathrooms?: string; rent?: string; photo?: string } = {},
) {
  await page.locator("#ro-address").fill(values.address ?? "Calle 44 #71-12, Laureles");
  await page.locator("#ro-bedrooms").fill(values.bedrooms ?? "2");
  await page.locator("#ro-bathrooms").fill(values.bathrooms ?? "1");
  await page.locator("#ro-rent").fill(values.rent ?? "2400000");
  if (values.photo !== undefined) await page.locator("#ro-photo").fill(values.photo);
}

function continueButton(page: Page) {
  return page.locator('[data-testid="ro-step-listing"]').getByRole("button", { name: /Continue/ });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow, `${label}: horizontal overflow in px`).toBeLessThanOrEqual(1);
}

async function expectButtonUncovered(page: Page, label: string) {
  const button = continueButton(page);
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeEnabled();
  const box = await button.boundingBox();
  const previewBox = await page.locator('[data-testid="ro-live-preview"]').boundingBox();
  if (!box || !previewBox) throw new Error(`${label}: expected laid-out boxes`);
  const intersects = !(
    box.x + box.width <= previewBox.x ||
    previewBox.x + previewBox.width <= box.x ||
    box.y + box.height <= previewBox.y ||
    previewBox.y + previewBox.height <= box.y
  );
  expect(intersects, `${label}: preview overlaps the Continue button`).toBe(false);

  const width = page.viewportSize()?.width ?? 0;
  expect(box.x, `${label}: button starts inside the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label}: button ends inside the viewport`).toBeLessThanOrEqual(
    width + 1,
  );

  // A sticky/fixed layer can overlap a box without changing its geometry.
  const topmost = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element?.closest('[data-testid="ro-live-preview"]') ? "preview" : "form";
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmost, `${label}: another layer covers the Continue button`).toBe("form");
}
