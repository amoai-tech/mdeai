/**
 * SAN-1642: no-network, no-credential browser probe for comparing CI runners.
 * This is intentionally NOT a production smoke test or a release gate.
 */
import { createRequire } from "node:module";
import { readFileSync, appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const repoPackage = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const playwrightVersion = require("playwright/package.json").version;
const playwrightTestVersion = require("@playwright/test/package.json").version;
const expectedVersion = "1.64.1";

if (
  repoPackage.devDependencies.playwright !== expectedVersion ||
  repoPackage.devDependencies["@playwright/test"] !== expectedVersion ||
  playwrightVersion !== expectedVersion ||
  playwrightTestVersion !== expectedVersion
) {
  throw new Error(
    `Playwright/image version mismatch: expected ${expectedVersion}; installed ${playwrightVersion}/${playwrightTestVersion}`,
  );
}
if (Number(process.versions.node.split(".")[0]) !== 24) {
  throw new Error(`Expected Node 24; received ${process.version}`);
}

const started = performance.now();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileWidth = await page.evaluate(() => window.innerWidth);
  if (mobileWidth !== 390) throw new Error(`Expected 390px mobile viewport, got ${mobileWidth}`);
  await page.setContent(`<!doctype html>
    <html lang="en"><title>Isolated MDE browser benchmark</title>
      <button type="button" onclick="document.querySelector('output').textContent='Details opened'">View details</button>
      <output aria-live="polite"></output>
    </html>`);
  await page.getByRole("button", { name: "View details" }).click();
  const output = await page.locator("output").textContent();
  if (output !== "Details opened") throw new Error(`Button interaction failed: ${output}`);

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopWidth = await page.evaluate(() => window.innerWidth);
  if (desktopWidth !== 1440) throw new Error(`Expected 1440px desktop viewport, got ${desktopWidth}`);
  if ((await page.title()) !== "Isolated MDE browser benchmark") {
    throw new Error("Page title changed unexpectedly");
  }
  const milliseconds = Math.round(performance.now() - started);
  const result = {
    status: "PASS",
    playwright: playwrightVersion,
    node: process.version,
    browser: browser.version(),
    mobileWidth,
    desktopWidth,
    browserProbeMilliseconds: milliseconds,
    remoteRequests: 0,
  };
  console.log("SAN-1642 benchmark:", JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Playwright browser probe — PASS\n\n` +
        `- Playwright: ${result.playwright}, Node: ${result.node}, Chromium: ${result.browser}\n` +
        `- Mobile + desktop click/layout probe: PASS\n` +
        `- Browser probe (not CI setup): ${milliseconds} ms\n` +
        `- No external URL, credentials, database, or production deployment used\n` +
        `- **Compare the entire GitHub job duration**, including container image pull, package install and browser setup.\n`,
    );
  }
} finally {
  await browser.close();
}
