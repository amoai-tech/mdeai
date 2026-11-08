import { expect, test, type Page } from "./fixtures";
import { loadEnvLocalForE2E } from "./helpers/auth";

loadEnvLocalForE2E();

/**
 * Replayable, opt-in production browser verification of native page controls.
 * Real inventory may be empty. Authenticated artifacts are disabled.
 *
 * MDE_SAN1631_POSTMERGE=1 PROD_SMOKE_BASE_URL=https://www.mdeai.co
 * PW_SKIP_WEBSERVER=1 npx playwright test e2e/prod-san1631-page-control.spec.ts
 * --project=prod-smoke --workers=1 --retries=0
 */
test.use({ qaRole: "renter", screenshot: "off", video: "off", trace: "off" });
const enabled = process.env.MDE_SAN1631_POSTMERGE === "1";

test.beforeAll(() => {
  if (enabled && !process.env.MDE_QA_RENTER_EMAIL) {
    throw new Error("SAN-1631 needs the existing renter QA identity; no Super Admin fallback.");
  }
});

const composer = (page: Page) =>
  page.locator('[data-testid="rental-ask-composer"]:visible').first();

async function expectCurrentResults(page: Page) {
  const cards = page.locator('[data-testid="rentals-grid"] [data-result-kind="rental"][data-testid^="rental-card-"]');
  const empty = page.getByTestId("rentals-empty");
  await expect.poll(
    async () => (await cards.count()) > 0 || await empty.isVisible().catch(() => false),
    { timeout: 45_000, message: "real cards or the explicit empty-inventory state" },
  ).toBe(true);

  if (await empty.isVisible().catch(() => false)) {
    expect(await cards.count()).toBe(0);
    await expect(page.locator('[data-testid="map-pin"][data-pin-id]')).toHaveCount(0);
    return;
  }
  const cardPins = new Set(await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-pin-id")).filter((id): id is string => Boolean(id)),
  ));
  // On phones the map sheet is mounted lazily; open it from a card before
  // asserting that rendered pins match the cards.
  if ((page.viewportSize()?.width ?? 0) <= 390 && cardPins.size > 0) {
    const openMap = page.getByTestId("browse-map-fab");
    if (await openMap.isVisible().catch(() => false)) {
      await openMap.click();
      await expect(page.getByTestId("browse-map-toolbar")).toBeVisible({ timeout: 15_000 });
    }
  }
  const expected = [...cardPins].sort().join(",");
  await expect.poll(async () => {
    const ids = await page.locator('[data-testid="map-pin"][data-pin-id]').evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-pin-id")).filter((id): id is string => Boolean(id)),
    );
    return ids.sort().join(",");
  }, { timeout: 45_000, message: "map pins must settle to the current cards" }).toBe(expected);

  // Close the phone sheet before navigation; the next page must not inherit its overlay.
  if ((page.viewportSize()?.width ?? 0) <= 390) {
    const close = page.getByTestId("browse-map-close");
    if (await close.isVisible().catch(() => false)) await close.click();
  }
}

async function sendNativeCommand(page: Page, question: string, expectedUrl: string) {
  const active = composer(page);
  await expect(active).toBeVisible({ timeout: 30_000 });
  await active.locator("#rental-ask-input").fill(question);
  const send = active.getByTestId("rental-ask-send");
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await send.click();
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search, {
    timeout: 30_000,
  }).toBe(expectedUrl);
  await expectCurrentResults(page);
}

for (const viewport of [
  { label: "desktop 1440", width: 1440, height: 900 },
  { label: "mobile 390", width: 390, height: 844 },
]) {
  test.describe("SAN-1631 page control - " + viewport.label, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test.skip(!enabled, "Explicit MDE_SAN1631_POSTMERGE=1 required; no live QA during ordinary CI.");

    test("native command, manual filter, Back/Forward and page switching", async ({ qaRolePage: page }) => {
      test.setTimeout(180_000);
      const nativeCommand = "On this page, show only 1-bedroom apartments in Laureles.";
      let nativeCommandAgentPosts = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" &&
            new URL(request.url()).pathname.startsWith("/api/copilotkit") &&
            request.postData()?.includes(nativeCommand)) nativeCommandAgentPosts += 1;
      });

      const initial = await page.goto("/rentals", { waitUntil: "domcontentloaded" });
      expect(initial?.ok()).toBe(true);
      await sendNativeCommand(
        page,
        nativeCommand,
        "/rentals?neighborhood=Laureles&beds=1",
      );
      expect(nativeCommandAgentPosts).toBe(0); // Model-free native navigation.

      const beds2 = page.getByTestId("rentals-filter-beds-2");
      await expect(beds2).toBeVisible();
      await beds2.click();
      await expect.poll(() => new URL(page.url()).searchParams.get("beds")).toBe("2");
      await expect(beds2).toHaveAttribute("aria-current", "true");
      await expectCurrentResults(page);

      await page.goBack({ waitUntil: "domcontentloaded" });
      await expect.poll(() => new URL(page.url()).searchParams.get("beds")).toBe("1");
      await page.goForward({ waitUntil: "domcontentloaded" });
      await expect.poll(() => new URL(page.url()).searchParams.get("beds")).toBe("2");
      await expectCurrentResults(page);

      await page.goto("/events", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("events-browse")).toBeVisible();
      await page.goto("/rentals?neighborhood=Laureles&beds=2", { waitUntil: "domcontentloaded" });
      await expectCurrentResults(page);

      if (viewport.width === 390) {
        expect(await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        )).toBe(true);
      }
      expect(nativeCommandAgentPosts).toBe(0);
    });
  });
}
