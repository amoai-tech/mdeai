import { test, expect } from "./fixtures";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";
import type { Page } from "@playwright/test";
import { sendConciergeMessage } from "./helpers/maps-layout";

// CI release certification keeps full failure evidence only for anonymous users.
test.use({ qaRole: "anonymous", trace: "on-first-retry", screenshot: "only-on-failure", video: "off" });

/** SAN-755: two real guest searches on the same thread, not a mocked route. */
const guestTarget = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const isProtectedPreview = guestTarget ? new URL(guestTarget).hostname.endsWith(".vercel.app") : false;

type BudgetRow = {
  id: string;
  price_monthly: number | null;
  currency: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
type BudgetResult = { results: BudgetRow[]; total?: number };

/** Require both API truth and the rendered, price-constrained rental cards. */
async function askGuestBudget(page: Page, question: string, maximum: number) {
  const input = page.getByTestId("copilot-chat-region").getByRole("textbox").first();
  await expect(input).toBeEditable();
  const incoming = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/api/rentals/search"),
  { timeout: 30_000 });
  // Reuse the repository's accepted-send detection; the first click can be
  // dropped during hydration, so only retry when *no* API request was issued.
  await sendConciergeMessage(page, question);
  const response = await incoming;
  expect(response.status()).toBe(200);
  const parameters = response.request().postDataJSON() as {
    maxPriceMonthly?: number; budgetCurrency?: string; queryText?: string;
  };
  expect(parameters.maxPriceMonthly).toBe(maximum);
  expect(parameters.budgetCurrency).toBe("COP");
  const body = await response.json() as BudgetResult;
  expect(Array.isArray(body.results)).toBe(true);
  expect(body.results.every((r) => r.currency === "COP" &&
    typeof r.price_monthly === "number" && r.price_monthly <= maximum)).toBe(true);
  await expect(page.getByTestId("copilot-chat-region")).toContainText(
    `Applied budget: COP ${maximum.toLocaleString("en-US")} per month`,
    { timeout: 30_000 },
  );
  const cards = page.locator('[data-result-kind="rental"]');
  await expect(cards).toHaveCount(body.results.length, { timeout: 30_000 });
  for (const card of await cards.allInnerTexts()) {
    const match = card.match(/COP\s*([\d,.]+)\s*\/mo/);
    expect(match, "card must display a comparable COP monthly price").not.toBeNull();
    expect(Number(match![1].replace(/[,.]/g, ""))).toBeLessThanOrEqual(maximum);
  }
  await expect(page.getByTestId("concierge-sign-in-prompt")).toHaveCount(0);
  return { parameters, body };
}

test.describe("SAN-755 guest budget refinement on public rental search", () => {
  // Guest artifacts are safe to keep only on failure; authenticated artifacts
  // are deliberately disabled in the separate QA scenarios below.
  test.skip(!guestTarget, "Set explicit PROD_SMOKE_BASE_URL for real deployed browser proof");

  for (const width of [390, 1440]) {
    test(`guest budget COP 3M to COP 2.5M (${width}px) updates the same search`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      if (isProtectedPreview) {
        const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";
        expect(secret, "staged deployment must use real Vercel protection bypass").not.toBe("");
        await establishVercelAutomationBypass(page, guestTarget, secret);
      }
      const errors: string[] = [];
      let searches = 0;
      page.on("request", (request) => {
        if (request.method() === "POST" && request.url().includes("/api/rentals/search")) searches++;
      });
      page.on("pageerror", (error) => errors.push(error.message));
      const home = await page.goto(new URL("/chat", guestTarget).toString(), { waitUntil: "domcontentloaded" });
      expect(home?.status()).toBe(200);
      const initial = await askGuestBudget(page, "Only show apartments under COP 3 million per month", 3_000_000);
      const refined = await askGuestBudget(page, "Now only under COP 2.5 million per month", 2_500_000);
      expect(searches, "one real rental request per user message").toBe(2);
      // PR #851 failed here when the second request dropped the original
      // semantic search wording and discovered unrelated cheaper apartments.
      expect(refined.parameters.queryText).toBe(initial.parameters.queryText);
      if (typeof initial.body.total === "number" && typeof refined.body.total === "number") {
        expect(refined.body.total).toBeLessThanOrEqual(initial.body.total);
      }
      if (width === 390) {
        const mapped = refined.body.results.filter((row) =>
          typeof row.latitude === "number" && typeof row.longitude === "number").length;
        // This is a floating map CTA, not necessarily a native <button>.
        // Assert the user-visible label; the prior role selector falsely
        // failed despite the correct "Open map (1)" CTA in the screenshot.
        await expect(page.getByText(`Open map (${mapped})`, { exact: true }))
          .toBeVisible({ timeout: 20_000 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(false);
      expect(errors).toEqual([]);
    });
  }
});
