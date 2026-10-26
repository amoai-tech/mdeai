import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  createThrowawayIdentity,
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
const firstQuery = "Show furnished 2-bedroom apartments in Laureles.";
const budgetQuery = "Only under COP 3 million per month.";

test.use({ channel: "chrome", viewport: { width: 1440, height: 900 }, trace: "off", screenshot: "off", video: "off" });

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
      await expect(send).toBeEnabled({ timeout: 30_000 });
      await send.click();
      await expect(banner).toContainText(question, { timeout: 110_000 });
    };

    await ask(firstQuery);
    await expect.poll(() => cards.count(), { timeout: 40_000 }).toBeGreaterThan(0);
    await ask(budgetQuery);
    await expect.poll(() => cards.count(), { timeout: 40_000 }).toBeGreaterThan(0);
    const before = await visible();
    const pinsBefore = await markerIds();
    const bannerBefore = await banner.innerText();
    const threadBefore = await threadId();
    expect(threadBefore).toMatch(/^[0-9a-f-]{36}$/i);
    expect(before.length).toBeGreaterThan(0);
    expect(new Set(before.map((r) => r.id)).size).toBe(before.length);

    // UI result callbacks can precede Mastra's durable transcript write.
    // Do not refresh immediately and misclassify a persistence race as success.
    await expect.poll(async () => {
      const response = await page.request.get(new URL(
        "/api/threads/" + threadBefore + "/messages", base,
      ).toString());
      return response.ok() && JSON.stringify(await response.json()).includes(budgetQuery);
    }, {
      timeout: 60_000, intervals: [1000, 2000, 3000],
      message: "The budget refinement must be durably saved before reloading",
    }).toBe(true);
    await capture("01-refined");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(banner).toContainText(budgetQuery, { timeout: 50_000 });
    await expect.poll(visible, { timeout: 50_000 }).toEqual(before);
    await expect.poll(markerIds, { timeout: 30_000 }).toEqual(pinsBefore);
    expect(await banner.innerText()).toBe(bannerBefore);
    expect(await threadId()).toBe(threadBefore);

    // A mapped card has the canonical pin identity; if Google Maps loaded,
    // compare actual marker IDs, not screenshot positions or guessed addresses.
    const mappedCardIds = before.map((row) => row.pinId).filter(Boolean).sort();
    if (pinsBefore.length > 0) expect(pinsBefore).toEqual(mappedCardIds);

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
