import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";
import {
  createThrowawayIdentity,
  getSupabaseAdmin,
  deleteThrowawayIdentity,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";

/**
 * SAN-1421 / PR #547 — opt-in, real signed-in regression against the deployed app.
 * Reuses the existing production Playwright project and disposable Supabase identity.
 * Never saves auth state, cookies, service keys, or private traces.
 *
 * Run:
 *   PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1 \
 *   npx playwright test e2e/prod-rentals-results-refresh.spec.ts --project=prod-smoke --workers=1
 *
 * Optional local-only visual evidence: MDE_QA_EVIDENCE_DIR=/absolute/private/path
 */
const base = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const evidenceDir = process.env.MDE_QA_EVIDENCE_DIR?.trim();
const candidatePreview = base ? new URL(base).hostname.endsWith(".vercel.app") : false;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";
const firstQuery = "Show me furnished 2-bedroom apartments in Laureles under COP 3 million.";
const budgetQuery = "Only under COP 3 million per month.";

const isMobile = process.env.MDE_QA_RENTALS_MOBILE === "1";
test.use({
  channel: "chrome",
  viewport: isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  trace: "off", screenshot: "off", video: "off",
});

test.describe("SAN-1421 — same-thread filtered cards survive production reload", () => {
  test.skip(!base, "Explicit PROD_SMOKE_BASE_URL is required; never silently use localhost.");

  let identity: ThrowawayIdentity | undefined;
  test.beforeAll(async () => {
    expect(hasE2eEnv(), "Real Supabase QA credentials are required, never an auth bypass").toBe(true);
    identity = await createThrowawayIdentity("qa-san1421-refresh");
  });
  test.afterAll(async () => {
    if (identity) await deleteThrowawayIdentity(identity);
  });

  test("matches listing IDs, prices, mapped pins, banner and saved transcript after reload", async ({ page }) => {
    test.setTimeout(300_000);
    await signInAsOnOrigin(page, base, identity!.email);
    // Session injection clears cookies; reinstall protected Vercel preview access
    // in this same real browser context (never treat a login page as MDE).
    if (candidatePreview) await establishVercelAutomationBypass(page, base, bypassSecret);
    await page.goto(new URL("/rentals", base).toString(), { waitUntil: "domcontentloaded" });

    // DiscoveryWorkspace has separate responsive composer shells. Target only the
    // visible one, never an ambiguous duplicate #rental-ask-input selector.
    const input = page.locator('[data-testid="rental-ask-composer"]:visible #rental-ask-input').first();
    const send = page.locator('[data-testid="rental-ask-composer"]:visible [data-testid="rental-ask-send"]').first();
    const banner = page.locator('[data-testid="rental-ask-answer"]:visible').first();
    const cards = page.locator('[data-testid="rentals-grid"] [data-result-kind="rental"][data-testid^="rental-card-"]');

    const visible = async () => cards.evaluateAll((els) => els.map((el) => ({
      id: el.getAttribute("data-testid")?.slice("rental-card-".length) ?? "",
      price: (el.textContent ?? "").match(/COP\s*[\d,.]+/g) ?? [],
      pinId: el.getAttribute("data-pin-id"),
    })));
    const markerIds = async () => page.locator('[data-testid="map-pin"][data-pin-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-pin-id") ?? "").sort());
    const threadId = async () => page.evaluate(() => {
      const raw = sessionStorage.getItem("mde:thread-selection:v1");
      if (!raw) return "";
      const state = JSON.parse(raw) as {
        activeThreadId?: string; savedThreadId?: string; sessionThreadId?: string;
      };
      return state.activeThreadId ?? state.savedThreadId ?? state.sessionThreadId ?? "";
    });
    const capture = async (name: string) => {
      if (!evidenceDir) return;
      mkdirSync(evidenceDir, { recursive: true });
      await page.screenshot({ path: join(evidenceDir, name + ".png"), fullPage: true });
    };
    const ask = async (question: string) => {
      await expect(input).toBeVisible({ timeout: 40_000 });
      await input.fill(question);
      // Never send via Enter before the CoAgent is ready: at 390px that
      // silently leaves the draft visible and can be mistaken for bad results.
      await expect(send).toBeEnabled({ timeout: 30_000 });
      await send.click();
      await expect(input).toBeEmpty({ timeout: 10_000 });
      await expect(banner).toContainText(question, { timeout: 110_000 });
    };

    await ask(firstQuery);
    await expect.poll(() => cards.count(), { timeout: 40_000 }).toBeGreaterThan(0);
    // Furnishing isn't an enforced search predicate: never certify these cards as furnished.
    await expect(banner).toContainText("can't filter by furnished");
    await ask(budgetQuery);
    await expect.poll(() => cards.count(), { timeout: 40_000 }).toBeGreaterThan(0);
    const before = await visible();
    const pinsBefore = await markerIds();
    const bannerBefore = await banner.innerText();
    const threadBefore = await threadId();
    expect(threadBefore).toMatch(/^[0-9a-f-]{36}$/i);
    expect(before.length).toBeGreaterThan(0);
    expect(new Set(before.map((r) => r.id)).size).toBe(before.length);
    await expect(banner).toContainText("can't filter by furnished");

    // Independent grounding: verify canonical IDs against the real apartment rows, rather
    // than trusting what the AI or a result card says. These are read-only queries.
    const admin = await getSupabaseAdmin();
    const { data: stored, error: readError } = await admin
      .from("apartments")
      .select("id,neighborhood,bedrooms,furnished,price_monthly,currency")
      .in("id", before.map((row) => row.id));
    expect(readError).toBeNull();
    const canonical = new Map((stored ?? []).map((row) => [row.id, row]));
    expect(canonical.size, "every card must resolve to an apartment in Supabase").toBe(before.length);
    for (const card of before) {
      const row = canonical.get(card.id);
      expect(row, `missing source row for ${card.id}`).toBeDefined();
      expect(row!.neighborhood.toLowerCase()).toBe("laureles");
      // An explicit 2-bedroom query means exactly two, not "two or more".
      expect(row!.bedrooms).toBe(2);
      expect(row!.currency, "a COP monthly-budget result must be priced in COP").toBe("COP");
      expect(row!.price_monthly, "a monthly-budget match needs a stored monthly price")
        .not.toBeNull();
      expect(Number(row!.price_monthly)).toBeLessThanOrEqual(3_000_000);
      // A false/null furnished value is never an asserted match. The UI must disclose
      // that furnishing was not filtered, including after a follow-up and refresh.
      if (row!.furnished !== true) {
        expect(bannerBefore).toContain("can't filter by furnished");
      }
    }
    expect(bannerBefore).toContain("Other currencies are excluded because no exchange rate is available.");

    // Production regression for the real user action: refresh as soon as the
    // completed-results banner is visible. The page must not publish that
    // banner while the agent's user turn is still being persisted. Never
    // poll the backend BEFORE refresh: it masked the lost-message bug.
    await capture("01-refined");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(banner).toContainText(budgetQuery, { timeout: 50_000 });
    await expect(banner).toContainText("can't filter by furnished");
    await expect.poll(visible, { timeout: 50_000 }).toEqual(before);
    await expect.poll(markerIds, { timeout: 30_000 }).toEqual(pinsBefore);
    expect(await banner.innerText()).toBe(bannerBefore);
    expect(await threadId()).toBe(threadBefore);

    // A mapped card has the canonical pin identity; if Google Maps loaded,
    // compare actual marker IDs, not screenshot positions or guessed addresses.
    const mappedCardIds = before.map((row) => row.pinId).filter(Boolean).sort();
    // Zero source coordinates means zero pins: this is a correct empty set,
    // not a reason to fabricate the neighborhood centre.
    expect(pinsBefore).toEqual(mappedCardIds);

    const transcriptToggle = page.locator('[data-testid="rental-ask-toggle-transcript"]:visible').first();
    await expect(transcriptToggle).toBeVisible({ timeout: 40_000 });
    if (await transcriptToggle.getAttribute("aria-expanded") === "false") await transcriptToggle.click();
    const lines = page.locator('[data-testid="rental-ask-transcript"]:visible li');
    await expect.poll(async () => (await lines.allInnerTexts())
      .filter((s) => s.startsWith("You") && s.includes(firstQuery)).length,
    { timeout: 30_000 }).toBe(1);
    await expect.poll(async () => (await lines.allInnerTexts())
      .filter((s) => s.startsWith("You") && s.includes(budgetQuery)).length,
    { timeout: 30_000 }).toBe(1);
    // On a phone the expanded transcript deliberately uses the results' screen space.
    // Close that user-opened panel before returning to the apartment cards, rather than
    // force-clicking through the composer/nav overlay and measuring an impossible action.
    if (isMobile) {
      await transcriptToggle.click();
      await expect(transcriptToggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator('[data-testid="rental-ask-transcript"]')).toHaveCount(0);
    }
    // AI result → real Details: same selected listing, not another search or a fake link.
    const firstResult = before[0];
    // The card also exposes a photo button with an accessible name beginning
    // "Details:"; use the precise CTA rather than an ambiguous role/name match.
    await page.getByTestId(`rental-details-cta-${firstResult.id}`).click();
    const details = page.getByTestId(isMobile ? "rental-details-sheet" : "rental-details-panel");
    await expect(details).toBeVisible();
    // The source listing's canonical displayed price must not change in Details.
    const firstPrice = firstResult.price[0];
    if (firstPrice) {
      const detailText = await details.innerText();
      expect(detailText.replaceAll(",", "")).toContain(firstPrice.replaceAll(",", ""));
    }
    if (firstResult.pinId) {
      await expect(page.locator(`[data-testid="map-pin"][data-pin-id="${firstResult.pinId}"][data-marker-selected="true"]`))
        .toHaveCount(1);
    }
    await page.getByTestId("rental-details-close").click();
    await expect(details).toHaveCount(0);
    if (isMobile) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const mapButton = page.getByTestId("browse-map-fab");
      await expect(mapButton).toBeVisible();
      await mapButton.click();
      const mapDialog = page.getByRole("dialog", { name: "Map view" });
      await expect(mapDialog).toBeVisible();
      await expect(mapDialog.getByTestId("chat-map")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(mapDialog).toHaveCount(0);
    }
    await capture("02-restored");

    // A different URL scope cannot inherit old saved cards or their answer banner.
    await page.goto(new URL("/rentals?neighborhood=Envigado&beds=2", base).toString());
    await expect(page.locator('[data-testid="rental-ask-answer"]:visible')).toHaveCount(0);
    await page.goto(new URL("/rentals", base).toString());
    await expect(banner).toContainText(budgetQuery, { timeout: 40_000 });
    await expect.poll(visible, { timeout: 40_000 }).toEqual(before);

    await page.getByTestId("rental-ask-answer-clear").click();
    await expect(page.locator('[data-testid="rental-ask-answer"]:visible')).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-testid="rental-ask-answer"]:visible')).toHaveCount(0);
  });
});
