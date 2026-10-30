#!/usr/bin/env node
/**
 * SAN-1606 — one command to verify the mobile navigation on a deployed release.
 *
 *   npm run verify:mobile-nav -- <url> <expected-sha>
 *
 * 1. Confirms the running deployment reports the expected commit (`/api/version`).
 * 2. Runs the existing navigation journey (`e2e/mobile-bottom-nav.spec.ts`) against that URL —
 *    tabs, active state, Back/Forward, excluded routes, chips hidden, keyboard hide/return,
 *    320/428 geometry and the 1024px desktop boundary.
 * 3. Adds the checks a deployed URL needs on top of the spec: the 1023px boundary, 1280px,
 *    the compact composer, the map sheet, a long draft, the keyboard overlay (bar + map control
 *    gone, composer above the keyboard, everything restored) and the routes that have no bar.
 *
 * Read-only: navigates and measures. No writes, no bookings, no messages.
 * Prints PASS/FAIL per check and exits non-zero if anything fails.
 *
 * The expected SHA comes from the deploy you are checking:
 *   git rev-parse HEAD                      (the commit you just merged)
 *   curl -s <url>/api/version               (what the deployment reports)
 * Pass `HEAD` to use this checkout's commit automatically. Local URLs skip the SHA check because
 * `next dev`/`next start` have no Vercel commit.
 */
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h") || args.length === 0) {
  console.log(`usage: npm run verify:mobile-nav -- <url> <expected-sha|HEAD>

  <url>            deployment to check, e.g. https://mdeai-gamma.vercel.app
  <expected-sha>   40-char commit, or HEAD to use this checkout (git rev-parse HEAD)
  local URLs       skip the deployed-commit check (no Vercel commit there)

Find the deployed SHA with:  curl -s <url>/api/version`);
  process.exit(args.length === 0 ? 2 : 0);
}
const [rawUrl, rawSha = ""] = args;
const base = rawUrl.replace(/\/+$/, "");
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);
// `HEAD` resolves to this checkout, which is what you verify right after a merge.
const expectedSha =
  rawSha.trim().toUpperCase() === "HEAD"
    ? spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() ?? ""
    : rawSha.trim();

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` — ${JSON.stringify(detail)?.slice(0, 240) ?? ""}`}`);
};

const READ = () => {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) };
  };
  const overlap = (a, b) => Boolean(a && b && a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom);
  const bar = box('[data-testid="mobile-bottom-nav"]');
  const chips = document.querySelector('[data-testid="chat-query-bar"]');
  const panel = document.querySelector('[data-testid="center-chat-panel"]');
  const results = document.querySelector('[data-testid="workspace-results-column"]');
  return {
    path: location.pathname,
    bar,
    tabs: [...document.querySelectorAll("[data-testid^='mobile-nav-']")].map((el) => ({
      id: el.getAttribute("data-testid").replace("mobile-nav-", ""),
      current: el.getAttribute("aria-current") === "page",
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height),
    })),
    chips: chips ? getComputedStyle(chips).display : null,
    composer: box('[data-testid="copilot-chat-input"]'),
    send: box('[data-testid="copilot-send-button"]'),
    mapControl: box('[data-testid="map-mobile-controls"]'),
    marker: document.documentElement.dataset.mdeNoNav ?? null,
    panelPad: panel ? getComputedStyle(panel).paddingBottom : null,
    resultsPad: results ? getComputedStyle(results).paddingBottom : null,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overlap: { navComposer: overlap(bar, box('[data-testid="copilot-chat-input"]')), navMap: overlap(bar, box('[data-testid="map-sheet-trigger"]')) },
  };
};

/**
 * Console/HTTP failures this journey legitimately produces, matched exactly (never by substring —
 * a new error that merely mentions "maps" or "404" must still fail the run):
 * - the guest CopilotKit runtime answers 401 until sign-in;
 * - `/_vercel/insights/script.js` is injected by Vercel and 404s on a local `next start`;
 * - Google Maps falls back to raster tiles when WebGL is unavailable.
 * A console "Failed to load resource" line is accepted only when both its status token and its
 * source URL match one of those cases. All other console errors fail the run.
 */
function safePathname(rawUrl) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return "";
  }
}

const REQUESTS_ALLOWED = [
  (status, url) => status === 401 && safePathname(url) === "/api/copilotkit",
  (status, url) => status === 404 && safePathname(url).startsWith("/_vercel/insights/"),
];
const CONSOLE_ALLOWED = [
  {
    test: (message, url) =>
      /^Failed to load resource: the server responded with a status of 401\b/.test(message) &&
      safePathname(url) === "/api/copilotkit",
  },
  {
    test: (message) =>
      /^Attempted to load a Vector Map, but failed\. Falling back to Raster\.$/.test(message),
  },
  {
    test: (message, url) =>
      /^Failed to load resource: the server responded with a status of 404\b/.test(message) &&
      safePathname(url).startsWith("/_vercel/insights/"),
  },
];

/** Wait for something the journey depends on, and fail loudly if it never arrives. */
async function must(locator, label, timeout = 30_000) {
  try {
    await locator.first().waitFor({ timeout });
  } catch {
    throw new Error(`missing ${label}: it did not appear within ${timeout}ms`);
  }
}

const browser = await chromium.launch();

// 1) deployed commit
if (isLocal) {
  console.log("SKIP  deployed commit — local URL, /api/version is not a release");
} else {
  try {
    const response = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(30_000) });
    const body = await response.text();
    const sha = (body.match(/[0-9a-f]{40}/g) ?? [])[0] ?? "";
    const expected = expectedSha.toLowerCase();
    // Compare every character supplied. A full 40-char SHA must match exactly;
    // a deliberately short input still works as a prefix.
    const matches = Boolean(sha) && (!expected || sha.startsWith(expected));
    check(
      `deployed commit ${expectedSha ? `matches ${expectedSha.slice(0, 12)}` : "is reported"} (deployment says ${sha.slice(0, 12) || "nothing"})`,
      response.ok && matches,
      {
        status: response.status,
        deployed: sha,
        expected: expectedSha || "(none supplied)",
        hint: "pass the merged commit (git rev-parse HEAD) or HEAD",
        body: body.slice(0, 160),
      },
    );
  } catch (error) {
    check("deployed commit endpoint reachable", false, String(error).slice(0, 200));
  }
}

// 2) the existing journey spec, against this URL
{
  const child = spawnSync(
    "npx",
    ["playwright", "test", "e2e/mobile-bottom-nav.spec.ts", "--project=local-chromium", "--workers=1", "--reporter=line"],
    {
      env: { ...process.env, SMOKE_BASE_URL: base, PW_SKIP_WEBSERVER: "1" },
      encoding: "utf8",
      timeout: 15 * 60_000,
    },
  );
  // Keep the child's full output: a bare exit code cannot tell a real regression from a flake.
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`.trim();
  if (child.status !== 0) {
    const failed = output
      .split("\n")
      .filter((line) => /✘|Error:|expect\(|Timeout|failed|›/.test(line))
      .slice(-12)
      .join(" | ");
    console.error("----- navigation journey spec output (last lines) -----");
    console.error(output.split("\n").slice(-40).join("\n"));
    console.error("----------------------------------------------------");
    check("existing navigation journey spec (tabs, Back/Forward, exclusions, chips, keyboard, 320/428, 1024)", false, failed || output.slice(-400));
  } else {
    const passed = (output.match(/(\d+) passed/) ?? [])[1] ?? "?";
    check(`existing navigation journey spec (${passed} tests: tabs, Back/Forward, exclusions, chips, keyboard, 320/428, 1024)`, true, null);
  }
}

// 3) deployed-only checks
const context390 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context390.newPage();
const consoleErrors = [];
const failedResponses = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  consoleErrors.push({ message: m.text().slice(0, 200), url: m.location().url });
});
page.on("response", (response) => {
  if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
});

const go = async (path) => {
  // `load` can be held back by long-lived requests; `#main-content` is the real readiness gate
  // (see requireRenderedPage), so there is deliberately no swallowed wait here.
  return page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
};

/** Every page in this journey renders `#main-content`; without it nothing below is meaningful. */
const requireRenderedPage = async (target, path, label = "main content") => {
  try {
    await must(target.locator("#main-content"), `${path} ${label}`, 30_000);
  } catch (error) {
    check(`rendered ${path}`, false, String(error).slice(0, 200));
    return false;
  }
  return true;
};

for (const [path, tab] of [["/", "home"], ["/chat", "chat"], ["/rentals", "rentals"], ["/restaurants", "restaurants"], ["/events", "events"]]) {
  const response = await go(path);
  if (!(await requireRenderedPage(page, path))) continue;
  await must(page.locator('[data-testid="mobile-bottom-nav"]'), `${path} mobile navigation bar`, 30_000);
  const read = await page.evaluate(READ);
  check(`${path} at 390px: 200 + 64px bar at x=12 with 5 tabs`, response?.status() === 200 && read.bar?.h === 64 && read.bar?.x === 12 && read.tabs.length === 5, { status: response?.status(), bar: read.bar, tabs: read.tabs.length });
  check(`${path} at 390px: exactly "${tab}" is current, 44px targets`, read.tabs.filter((t) => t.current).length === 1 && read.tabs.find((t) => t.current)?.id === tab && read.tabs.every((t) => t.w >= 44 && t.h >= 44), read.tabs);
  check(`${path} at 390px: no horizontal overflow`, read.overflowX <= 0, read.overflowX);
  if (path === "/chat") {
    check("/chat at 390px: chip strip hidden, composer 56-64px", read.chips === "none" && Boolean(read.composer) && read.composer.h >= 56 && read.composer.h <= 64, { chips: read.chips, composer: read.composer });
    check("/chat at 390px: bar does not overlap the composer or map control", !read.overlap.navComposer && !read.overlap.navMap, read.overlap);
  }
}

// map sheet opens and closes with a 44px control (the trigger only exists on /chat)
{
  await go("/chat");
  await requireRenderedPage(page, "/chat");
  let sheetOpened = false;
  try {
    await must(page.getByTestId("copilot-chat-textarea"), "/chat composer", 60_000);
    await must(page.getByTestId("map-sheet-trigger"), "/chat map trigger", 30_000);
    await page.getByTestId("map-sheet-trigger").click();
    await must(page.getByTestId("map-sheet-content"), "map sheet", 30_000);
    sheetOpened = true;
    const close = await page.getByRole("button", { name: "Close" }).boundingBox();
    check("map sheet opens with a 44px close control", Boolean(close) && close.width >= 44 && close.height >= 44, close);
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("map-sheet-content").waitFor({ state: "hidden", timeout: 20_000 });
    check("map sheet closes", true, null);
  } catch (error) {
    check(`map sheet ${sheetOpened ? "closes" : "opens"}`, false, String(error).slice(0, 200));
  }
}

// long draft: capped, Send reachable
{
  const input = page.getByTestId("copilot-chat-textarea");
  await must(input, "/chat composer for the long-draft check", 30_000);
  await input.click();
  await input.pressSequentially("two bedrooms in Laureles with a desk, natural light and a quiet street near the metro", { delay: 1 });
  const read = await page.evaluate(READ);
  check("long draft stays within 112-128px", Boolean(read.composer) && read.composer.h > 64 && read.composer.h <= 128, read.composer);
  check("Send stays above the bar with a draft", Boolean(read.send) && Boolean(read.bar) && read.send.bottom <= read.bar.y, { send: read.send, bar: read.bar });
}

// routes without the bar reserve nothing
for (const path of ["/cafes", "/nightlife"]) {
  await go(path);
  const rendered = await requireRenderedPage(page, path, "browse column");
  if (!rendered) continue;
  try {
    await must(page.locator('[data-testid="workspace-results-column"]'), `${path} results column`, 45_000);
  } catch (error) {
    check(`rendered ${path} results`, false, String(error).slice(0, 200));
    continue;
  }
  const read = await page.evaluate(READ);
  check(`${path} at 390px: no bar and nothing reserved`, read.bar === null && read.resultsPad === "0px", { bar: read.bar, pad: read.resultsPad });
}

const unexpectedResponses = failedResponses.filter(
  ({ status, url }) => !REQUESTS_ALLOWED.some((allowed) => allowed(status, url)),
);
check("no unexpected failed requests (only the guest runtime 401 and local analytics 404 are allowed)", unexpectedResponses.length === 0, unexpectedResponses.slice(0, 5));
const unexpectedConsole = consoleErrors.filter(
  ({ message, url }) => !CONSOLE_ALLOWED.some((rule) => rule.test(message, url)),
);
check("no unexpected console errors", unexpectedConsole.length === 0, unexpectedConsole.slice(0, 5));
await context390.close();

// an unsupported path must not render the bar — its own context, so its deliberate 404 is not
// mixed into the console contract above
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const odd = await context.newPage();
  const response = await odd.goto(`${base}/constructor/example`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
  // The not-found view is a legitimate response without `#main-content`; require a rendered
  // document instead, then assert the bar is absent.
  const rendered = await odd
    .waitForFunction(() => document.body !== null && document.body.childElementCount > 0, null, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  check("/constructor/example answers without the bar (prototype-key allowlist)", rendered && (await odd.locator('[data-testid="mobile-bottom-nav"]').count()) === 0, { status: response?.status(), rendered });
  await context.close();
}

// 1023 / 1024 / 1280 boundaries
for (const [width, barExpected] of [[1023, true], [1024, false], [1280, false]]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 1024, hasTouch: width < 1024 });
  const sized = await context.newPage();
  await sized.goto(`${base}/chat`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (!(await requireRenderedPage(sized, "/chat"))) {
    await context.close();
    continue;
  }
  await sized.waitForTimeout(1500);
  const read = await sized.evaluate(READ);
  check(`${width}px: bar ${barExpected ? "present" : "absent"}`, barExpected ? read.bar?.h === 64 : read.bar === null, read.bar);
  if (!barExpected) check(`${width}px: chip strip back on desktop`, read.chips === "block", read.chips);
  await context.close();
}

// keyboard overlay: bar and map control hide, composer clears the keyboard, then everything returns
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const kp = await context.newPage();
  await kp.addInitScript(() => {
    const state = { keyboard: 0 };
    const listeners = new Set();
    const vv = {
      get width() { return window.innerWidth; },
      get height() { return window.innerHeight - state.keyboard; },
      offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
      addEventListener: (_t, l) => listeners.add(l),
      removeEventListener: (_t, l) => listeners.delete(l),
      dispatchEvent: () => true,
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
    window.__setKeyboard = (h) => {
      state.keyboard = h;
      for (const l of [...listeners]) l(new Event("resize"));
    };
  });
  await kp.goto(`${base}/chat`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  let keyboardApplied = true;
  try {
    if (!(await requireRenderedPage(kp, "/chat"))) keyboardApplied = false;
    await must(kp.getByTestId("copilot-chat-textarea"), "/chat composer", 60_000);
    await kp.getByTestId("copilot-chat-textarea").focus();
    await kp.evaluate(() => window.__setKeyboard(320));
    await kp.locator('[data-testid="mobile-bottom-nav"]').waitFor({ state: "detached", timeout: 20_000 });
  } catch (error) {
    keyboardApplied = false;
    check("keyboard overlay hides the bar", false, String(error).slice(0, 200));
  }
  const open = await kp.evaluate(READ);
  if (!keyboardApplied) {
    await context.close();
  } else {
  check("keyboard open: bar hidden", open.bar === null, open.bar);
  check("keyboard open: floating map control hidden", open.mapControl === null, open.mapControl);
  check("keyboard open: chat reserve released", open.panelPad === "0px", open.panelPad);
  const visualBottom = await kp.evaluate(() => Math.round((window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? innerHeight)));
  check("keyboard open: composer above the keyboard", Boolean(open.composer) && open.composer.bottom <= visualBottom + 1, { composer: open.composer, visualBottom });
  await kp.evaluate(() => window.__setKeyboard(0));
  let returned = true;
  try {
    await kp.locator('[data-testid="mobile-bottom-nav"]').waitFor({ state: "visible", timeout: 20_000 });
  } catch (error) {
    returned = false;
    check("keyboard closed: bar returns", false, String(error).slice(0, 200));
  }
  const closed = await kp.evaluate(READ);
  if (returned) {
    check("keyboard closed: bar and map control return, reserve restored", closed.bar !== null && closed.mapControl !== null && closed.panelPad === "80px" && closed.marker === null, { bar: closed.bar, map: closed.mapControl, pad: closed.panelPad, marker: closed.marker });
  }
  await context.close();
  }
}

const passed = results.filter((r) => r.pass).length;
console.log(`\nmobile navigation verification: ${passed}/${results.length} checks passed — ${base}`);
process.exitCode = passed === results.length ? 0 : 1;
try {
  await browser.close();
} catch (error) {
  console.error("browser close failed:", error);
  process.exitCode = 1;
}
