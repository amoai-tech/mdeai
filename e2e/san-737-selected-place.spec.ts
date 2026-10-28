import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  createThrowawayIdentity, deleteThrowawayIdentity, hasE2eEnv,
  signInAsOnOrigin, type ThrowawayIdentity,
} from "./helpers/auth";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";

/**
 * SAN-737 live acceptance. Uses the real page, authenticated CopilotKit stream,
 * source-backed public rows, and actual AI text. No mocked model, fake pins,
 * synthetic listing fixtures, client-editable role or browser retries.
 * Set SAN737_BASE_URL to a deployed/current local checkout to opt in.
 */
const base = process.env.SAN737_BASE_URL?.trim() ?? "";
const evidence = process.env.MDE_QA_EVIDENCE_DIR?.trim();
const preview = base ? new URL(base).hostname.endsWith(".vercel.app") : false;

type Route = "rentals" | "restaurants" | "events" | "cafes" | "nightlife";
test.use({ channel: "chrome", trace: "retain-on-failure", screenshot: "only-on-failure" });

const routes: { route: Route; card: string; select: string }[] = [
  { route: "rentals", card: '[data-testid^="rental-card-"][data-result-kind="rental"]', select: '[data-testid="rental-ask-select"]' },
  { route: "restaurants", card: '[data-testid^="restaurant-card-"][data-result-kind="restaurant"]', select: '[data-testid="restaurant-ask-select"]' },
  { route: "events", card: '[data-testid="event-card"]', select: '[data-testid="event-ask-select"]' },
  { route: "cafes", card: '[data-testid^="cafe-card-"]', select: '[data-testid="venue-ask-select"]' },
  { route: "nightlife", card: '[data-testid^="nightlife-card-"]', select: '[data-testid="venue-ask-select"]' },
];

function assistantTexts(history: Locator) {
  return history.locator("li").evaluateAll((items) => items.flatMap((li) => {
    const label = li.querySelector("span")?.textContent?.trim();
    return label === "MDE" || label === "MDE:"
      ? [li.textContent?.replace(/^\s*MDE:?\s*/, "").trim() ?? ""] : [];
  }).filter(Boolean));
}

async function ask(page: Page, route: Route, question: string, count: number) {
  const rental = route === "rentals";
  const input = page.locator(rental ? "#rental-ask-input" : '[data-testid="discovery-ask-input"]:visible');
  const send = page.locator(rental ? '[data-testid="rental-ask-send"]:visible' : '[data-testid="discovery-ask-send"]:visible');
  await expect(input).toBeVisible({ timeout: 40_000 });
  await input.fill(question);
  await expect(send).toBeEnabled({ timeout: 40_000 });
  // Assistant text arrives token-by-token. Merely seeing an MDE <li> means
  // streaming STARTED, not that the exact name has finished streaming.
  const completedRun = page.waitForResponse((response) => {
    if (!response.url().includes("/api/copilotkit") || response.request().method() !== "POST") return false;
    try {
      const envelope: unknown = response.request().postDataJSON();
      return !!envelope && typeof envelope === "object" && "method" in envelope &&
        envelope.method === "agent/run";
    } catch { return false; }
  }, { timeout: 125_000 });
  await send.click();
  if (rental && count === 1) {
    const toggle = page.locator('[data-testid="rental-ask-toggle-transcript"]:visible');
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();
  }
  const response = await completedRun;
  expect(response.status(), "real signed-in agent/run must succeed").toBe(200);
  const streamError = await response.finished();
  expect(streamError, "the agent stream must finish successfully").toBeNull();
  const stream = await response.text();
  expect(stream, "an HTTP 200 with only partial tokens is not an AI answer")
    .toContain('"type":"RUN_FINISHED"');
  const history = page.locator(rental ? '[data-testid="rental-ask-transcript"]:visible' : '[data-testid="discovery-ask-history"]:visible');
  await expect.poll(async () => (await assistantTexts(history)).length, { timeout: 60_000 })
    .toBeGreaterThanOrEqual(count);
  const replies = await assistantTexts(history);
  const reply = replies[count - 1] ?? "";
  expect(reply.length, "A real assistant answer is required, not HTTP 200 or the user prompt").toBeGreaterThan(8);
  expect(reply).not.toMatch(/MDE agent turn timed out|unable to process your request/i);
  return reply;
}

for (const size of [{ name: "desktop", width: 1440, height: 900 }, { name: "mobile-390", width: 390, height: 844 }]) {
  test.describe(`SAN-737 ${size.name}: selected A → B → Clear and saved thread`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    test.skip(!base, "Set SAN737_BASE_URL to explicitly exercise the real app");
    let identity: ThrowawayIdentity | undefined;
    test.beforeAll(async () => {
      expect(hasE2eEnv()).toBe(true);
      identity = await createThrowawayIdentity("qa-san737-selected-context");
    });
    test.afterAll(async () => { if (identity) await deleteThrowawayIdentity(identity); });

    for (const scenario of routes) {
      test(`${scenario.route}: changes grounded selection and clears it`, async ({ page }) => {
        test.setTimeout(490_000);
        if (!identity) throw new Error("Live QA identity unavailable");
        // Temporary authorized Vercel share links allow a signed-in browser to
        // reach protected previews without weakening Deployment Protection.
        // Never log or commit the share URL, which contains an access token.
        // This helper calls context.clearCookies(): sign in FIRST, then set
        // Vercel preview access. Otherwise the share/bypass cookie is erased.
        await signInAsOnOrigin(page, base, identity.email);
        const shareUrl = process.env.SAN737_PREVIEW_SHARE_URL?.trim();
        if (preview && shareUrl) {
          const share = new URL(shareUrl);
          if (share.protocol !== "https:" || share.origin !== new URL(base).origin ||
              !share.searchParams.has("_vercel_share")) {
            throw new Error("SAN737_PREVIEW_SHARE_URL must belong to this protected preview origin");
          }
          await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
        } else if (preview) {
          await establishVercelAutomationBypass(page, base,
            process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "");
        }
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const copilotPosts: number[] = [];
        page.on("response", (response) => {
          if (!response.url().includes("/api/copilotkit") || response.request().method() !== "POST") return;
          // Track only actual agent turns. The runtime intentionally returns 403
          // for resource/request /threads calls; those are security denials, not
          // selected-item answer failures and must remain blocked.
          try {
            const envelope: unknown = response.request().postDataJSON();
            if (envelope && typeof envelope === "object" && "method" in envelope &&
                envelope.method === "agent/run") {
              copilotPosts.push(response.status());
            }
          } catch { /* Non-JSON transport requests are outside this journey. */ }
        });
        await page.goto(new URL("/" + scenario.route, base).toString(), { waitUntil: "domcontentloaded" });
        // Supabase session restoration can remount the entire discovery view.
        // Do not interact with a card before the authenticated agent is ready.
        await expect(page.getByText("Checking session...", { exact: true })).toHaveCount(0, { timeout: 50_000 });
        // The connection banner may mount *after* session restoration. Waiting
        // for it to be absent can race hydration; a usable composer proves the
        // real authenticated agent is ready before clicking selection buttons.
        const composerInput = page.locator(scenario.route === "rentals"
          ? "#rental-ask-input" : '[data-testid="discovery-ask-input"]:visible');
        await expect(composerInput).toBeEnabled({ timeout: 90_000 });
        // A textarea is always enabled even while CopilotKit is connecting.
        // The send control is gated on the real co-agent isReady flag. Prove
        // readiness without sending any message, then clear the harmless draft.
        await composerInput.fill("Ready check — not sent");
        await expect(page.locator(scenario.route === "rentals"
          ? '[data-testid="rental-ask-send"]:visible' : '[data-testid="discovery-ask-send"]:visible'))
          .toBeEnabled({ timeout: 90_000 });
        await composerInput.fill("");
        const cards = page.locator(scenario.card);
        await expect.poll(() => cards.count(), { timeout: 40_000 }).toBeGreaterThanOrEqual(2);
        // Titles and IDs come from the actual rendered public data.
        const first = cards.nth(0);
        const second = cards.nth(1);
        const a = (await first.locator("h3").first().innerText()).trim();
        const b = (await second.locator("h3").first().innerText()).trim();
        expect(a.length).toBeGreaterThan(2);
        expect(b.length).toBeGreaterThan(2);
        expect(a).not.toBe(b);
        const select = (card: Locator) => scenario.route === "restaurants"
          ? card.locator("..").locator(scenario.select)
          : card.locator(scenario.select);
        await select(first).click();
        await expect(select(first)).toHaveAttribute("aria-pressed", "true");
        const firstReply = await ask(page, scenario.route,
          "What is the exact public name of the selected place? Verify the selected record using the public lookup before answering.", 1);
        expect(firstReply.toLocaleLowerCase()).toContain(a.toLocaleLowerCase());

        await select(second).click();
        await expect(select(second)).toHaveAttribute("aria-pressed", "true");
        await expect(select(first)).toHaveAttribute("aria-pressed", "false");
        const secondReply = await ask(page, scenario.route,
          "What is the exact name of the place I have selected NOW? Use its verified current record, not the previous item.", 2);
        expect(secondReply.toLocaleLowerCase()).toContain(b.toLocaleLowerCase());

        await select(second).click();
        await expect(select(second)).toHaveAttribute("aria-pressed", "false");
        const clearedReply = await ask(page, scenario.route,
          "Is any place currently selected? Do not assume the previous place is still selected.", 3);
        expect(clearedReply).toMatch(/no |none|not selected|nothing selected|cleared|don't have|do not have/i);
        expect(copilotPosts.filter((status) => status === 200).length).toBeGreaterThanOrEqual(3);
        expect(copilotPosts.some((status) => status >= 400 && status !== 401)).toBe(false);
        expect(errors).toEqual([]);
        if (evidence) {
          await mkdir(evidence, { recursive: true });
          await page.screenshot({ path: join(evidence, `san737-${scenario.route}-${size.name}.png`), fullPage: true });
        }
        // Navigation must not resurrect a prior route's selection.
        await page.goto(new URL(scenario.route === "events" ? "/restaurants" : "/events", base).toString());
        await page.goto(new URL("/" + scenario.route, base).toString());
        const restored = page.locator(scenario.card);
        await expect(select(restored.first())).toHaveAttribute("aria-pressed", "false");
        await page.reload();
        await expect(select(restored.first())).toHaveAttribute("aria-pressed", "false");
      });
    }
  });
}
