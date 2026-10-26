import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createThrowawayIdentity, deleteThrowawayIdentity, hasE2eEnv, signInAsOnOrigin, type ThrowawayIdentity } from "./helpers/auth";

const base = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
test.use({ channel: "chrome", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, screenshot: "only-on-failure", trace: "retain-on-failure" });

test("SAN-1390 Nightlife answers two live mobile questions without a browser retry", async ({ page }) => {
  test.skip(!base || new URL(base).hostname.endsWith("vercel.app"), "Local signed-in target required; protected previews need authenticated browser access");
  test.setTimeout(240_000);
  expect(hasE2eEnv()).toBe(true);
  let identity: ThrowawayIdentity | undefined;
  try {
    identity = await createThrowawayIdentity("qa-san1390-mobile-nightlife");
    await signInAsOnOrigin(page, base, identity.email);
    await page.goto(new URL("/nightlife", base).toString(), { waitUntil: "domcontentloaded" });
    const input = page.getByTestId("discovery-ask-input");
    await expect(input).toBeVisible({ timeout: 45_000 });
    const send = page.getByTestId("discovery-ask-send");
    const history = page.getByTestId("discovery-ask-history");
    for (const [index, question] of ["Find salsa clubs near Provenza", "Only with live salsa"].entries()) {
      await input.fill(question);
      await expect(send).toBeEnabled({ timeout: 30_000 });
      await send.click();
      await expect(history).toContainText(question, { timeout: 120_000 });
      await expect.poll(async () => history.locator("li").evaluateAll((nodes) => nodes.filter((node) => (node.textContent ?? "").trim().startsWith("MDE:")).length), { timeout: 120_000 }).toBeGreaterThan(index);
    }
    const cards = page.getByTestId("discovery-grounded-card");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    const screenshotDir = process.env.MDE_QA_EVIDENCE_DIR?.trim();
    if (screenshotDir) { await mkdir(screenshotDir, { recursive: true }); await page.screenshot({ path: join(screenshotDir, "nightlife-mobile-390-two-turn.png"), fullPage: true }); }
    await expect(page.getByTestId("discovery-ask-input")).toBeVisible();
  } finally {
    if (identity) await deleteThrowawayIdentity(identity);
  }
});
