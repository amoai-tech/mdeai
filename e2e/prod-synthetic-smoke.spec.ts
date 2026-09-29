/**
 * Production Runtime Smoke — SAN-1366 / SAN-1367.
 *
 * What this asserts, and what it deliberately does not
 * ---------------------------------------------------
 * BLOCKING  — the app reached a valid rendered terminal state for each vertical:
 *             result cards, or the vertical's own explicit empty state. See
 *             `helpers/vertical-terminal-state.ts` for the contract.
 * NOT BLOCKING — how much live inventory exists. Zero published listings is a valid product
 *             state; it is reported as **Marketplace Health** and never fails this smoke.
 *
 * Before this change the spec asserted `count() > 0` on four verticals. Those were inventory
 * assertions wearing an application check's name, so a healthy app with an empty marketplace was
 * reported as a broken app on every run from 2026-09-28.
 *
 * The four verticals are now four independent tests instead of one 4-query matrix. In the matrix
 * the first failing vertical aborted the run, so a single red vertical hid the health of the other
 * three — which is why 13 consecutive reds never revealed whether events, restaurants or cafés were
 * healthy. Each failure now names its own vertical.
 *
 * The file name (`prod-synthetic-smoke.spec.ts`) is an identifier retained to avoid churn in
 * `playwright.config.ts` and `package.json`; the signal's name is "Production Runtime Smoke".
 */
import { test, type Page } from "@playwright/test";
import { gotoHome, sendConciergeMessage, waitForCopilotIdle } from "./helpers/maps-layout";
import {
  VERTICALS,
  expectVerticalTerminalState,
  readVerticalSnapshot,
  type TerminalResult,
  type VerticalName,
} from "./helpers/vertical-terminal-state";
import fs from "node:fs";
import path from "node:path";

const isProdRun = Boolean(process.env.PROD_SMOKE_BASE_URL?.trim());
const outDir =
  process.env.PROD_SMOKE_OUT_DIR ??
  path.join(process.cwd(), "tmp", "prod-synthetic-smoke");

type VerticalObservation = {
  vertical: VerticalName;
  /** The blocking claim: which valid terminal state rendered. */
  terminalState: "results" | "empty";
  /** The non-blocking Marketplace Health observation. */
  marketplaceHealth: "healthy" | "empty";
  cards: number;
  copilotkitPosts: number;
};

const observations: VerticalObservation[] = [];

function copilotkitPostCounter(page: Page) {
  let count = 0;
  page.on("response", (res) => {
    if (
      res.url().includes("/api/copilotkit") &&
      res.request().method() === "POST"
    ) {
      count += 1;
    }
  });
  return () => count;
}

async function runVertical(page: Page, vertical: VerticalName, index: number): Promise<TerminalResult> {
  test.setTimeout(300_000);
  fs.mkdirSync(outDir, { recursive: true });

  const postCount = copilotkitPostCounter(page);

  await gotoHome(page);
  await sendConciergeMessage(page, VERTICALS[vertical].query);

  const terminal = await expectVerticalTerminalState(page, vertical, (text) =>
    sendConciergeMessage(page, text),
  );

  // The turn must still complete: a rendered terminal state proves the UI settled, not that the
  // agent finished. Keep the existing idle guarantee so CK request-budget counting stays valid.
  await waitForCopilotIdle(page, 120_000);

  await page.screenshot({
    path: path.join(outDir, `${String(index).padStart(2, "0")}-${vertical}.png`),
    fullPage: true,
  });

  const snapshot = await readVerticalSnapshot(page, vertical);
  const marketplaceHealth = terminal.state === "results" ? "healthy" : "empty";

  // Non-blocking: recorded as an annotation so it is visible in the report without gating.
  test.info().annotations.push({
    type: "marketplace-health",
    description: `Marketplace Health: ${marketplaceHealth} (results=${snapshot.results}, empty=${snapshot.empty})`,
  });
  test.info().annotations.push({
    type: "terminal-state",
    description: `${vertical}: ${terminal.state}`,
  });

  observations.push({
    vertical,
    terminalState: terminal.state,
    marketplaceHealth,
    cards: snapshot.results,
    copilotkitPosts: postCount(),
  });

  return terminal;
}

test.describe("Production Runtime Smoke", { tag: ["@prod", "@smoke"] }, () => {
  test.skip(!isProdRun, "Set PROD_SMOKE_BASE_URL (e.g. https://www.mdeai.co)");

  test("rentals reach a valid terminal state", async ({ page }) => {
    await runVertical(page, "rentals", 1);
  });

  test("events reach a valid terminal state", async ({ page }) => {
    await runVertical(page, "events", 2);
  });

  test("restaurants reach a valid terminal state", async ({ page }) => {
    const terminal = await runVertical(page, "restaurants", 3);
    // Preserved from the pre-SAN-1366 report: a non-blocking photo-coverage observation.
    const photoPlaceholders = await page
      .locator('[data-testid="restaurant-card-photo-placeholder"]:visible')
      .count();
    test.info().annotations.push({
      type: "restaurant-photo-placeholders",
      description: `photo placeholders: ${photoPlaceholders} (terminal=${terminal.state})`,
    });
  });

  test("cafes reach a valid terminal state", async ({ page }) => {
    await runVertical(page, "cafes", 4);
  });

  test.afterAll(async () => {
    // SAN-1367 — Marketplace Health is reported separately and is never a gate.
    const report = {
      at: new Date().toISOString(),
      baseURL: process.env.PROD_SMOKE_BASE_URL,
      signal: "Production Runtime Smoke",
      blockingClaim:
        "each vertical reached a valid rendered terminal state (result cards or explicit empty state)",
      nonBlockingClaim:
        "Marketplace Health: live inventory presence, reported only — never used to fail this run",
      observations,
      marketplaceHealth: observations.map((o) => ({
        vertical: o.vertical,
        health: o.marketplaceHealth,
        cards: o.cards,
      })),
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

    // Loudly visible, never failing: an empty vertical is information, not a regression.
    for (const o of observations) {
      if (o.marketplaceHealth === "empty") {
        console.log(
          `[marketplace-health] ${o.vertical}: 0 requestable listings — not an application failure`,
        );
      }
    }
  });
});
