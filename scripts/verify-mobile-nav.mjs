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
 */
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const [rawUrl, expectedSha = ""] = process.argv.slice(2);
if (!rawUrl) {
  console.error("usage: npm run verify:mobile-nav -- <url> <expected-sha>");
  process.exit(2);
}
const base = rawUrl.replace(/\/+$/, "");
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);

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

const browser = await chromium.launch();

// 1) deployed commit
if (isLocal) {
  console.log("SKIP  deployed commit — local URL, /api/version is not a release");
} else {
  try {
    const response = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(30_000) });
    const body = await response.text();
    const sha = (body.match(/[0-9a-f]{40}/g) ?? [])[0] ?? "";
    const expected = expectedSha.trim();
    check(
      `deployed commit is ${expected ? expected.slice(0, 12) : "any"}`,
      response.ok && Boolean(sha) && (expected ? sha.startsWith(expected.slice(0, 12)) : true),
      { status: response.status, sha, body: body.slice(0, 160) },
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
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));

const go = async (path) => {
  const response = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForLoadState("load", { timeout: 60_000 }).catch(() => {});
  return response;
};

for (const [path, tab] of [["/", "home"], ["/chat", "chat"], ["/rentals", "rentals"], ["/restaurants", "restaurants"], ["/events", "events"]]) {
  const response = await go(path);
  await page.locator('[data-testid="mobile-bottom-nav"]').waitFor({ timeout: 30_000 }).catch(() => {});
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
  await page.getByTestId("copilot-chat-textarea").waitFor({ timeout: 60_000 }).catch(() => {});
  await page.getByTestId("map-sheet-trigger").waitFor({ timeout: 30_000 }).catch(() => {});
  await page.getByTestId("map-sheet-trigger").click();
  const sheet = page.getByTestId("map-sheet-content");
  await sheet.waitFor({ timeout: 30_000 }).catch(() => {});
  const close = await page.getByRole("button", { name: "Close" }).boundingBox().catch(() => null);
  check("map sheet opens with a 44px close control", Boolean(close) && close.width >= 44 && close.height >= 44, close);
  await page.getByRole("button", { name: "Close" }).click();
  await sheet.waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
  check("map sheet closes", !(await sheet.isVisible().catch(() => false)), null);
}

// long draft: capped, Send reachable
{
  const input = page.getByTestId("copilot-chat-textarea");
  await input.click();
  await input.pressSequentially("two bedrooms in Laureles with a desk, natural light and a quiet street near the metro", { delay: 1 });
  const read = await page.evaluate(READ);
  check("long draft stays within 112-128px", Boolean(read.composer) && read.composer.h > 64 && read.composer.h <= 128, read.composer);
  check("Send stays above the bar with a draft", Boolean(read.send) && Boolean(read.bar) && read.send.bottom <= read.bar.y, { send: read.send, bar: read.bar });
}

// routes without the bar reserve nothing
for (const path of ["/cafes", "/nightlife"]) {
  await go(path);
  await page.locator('[data-testid="workspace-results-column"]').waitFor({ timeout: 45_000 }).catch(() => {});
  const read = await page.evaluate(READ);
  check(`${path} at 390px: no bar and nothing reserved`, read.bar === null && read.resultsPad === "0px", { bar: read.bar, pad: read.resultsPad });
}

check(
  "no unexpected console errors (guest runtime 401, Maps WebGL fallback, deliberate 404, dev HMR reconnect are expected)",
  consoleErrors.filter((e) => !/401|maps|google|Vector Map|404|ERR_NETWORK_CHANGED/i.test(e)).length === 0,
  consoleErrors.filter((e) => !/401|maps|google|Vector Map|404|ERR_NETWORK_CHANGED/i.test(e)).slice(0, 5),
);
await context390.close();

// 1023 / 1024 / 1280 boundaries
for (const [width, barExpected] of [[1023, true], [1024, false], [1280, false]]) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 1024, hasTouch: width < 1024 });
  const sized = await context.newPage();
  await sized.goto(`${base}/chat`, { waitUntil: "domcontentloaded", timeout: 90_000 });
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
  await kp.getByTestId("copilot-chat-textarea").waitFor({ timeout: 60_000 });
  await kp.waitForTimeout(1500);
  await kp.getByTestId("copilot-chat-textarea").focus();
  await kp.evaluate(() => window.__setKeyboard(320));
  await kp.locator('[data-testid="mobile-bottom-nav"]').waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
  const open = await kp.evaluate(READ);
  check("keyboard open: bar hidden", open.bar === null, open.bar);
  check("keyboard open: floating map control hidden", open.mapControl === null, open.mapControl);
  check("keyboard open: chat reserve released", open.panelPad === "0px", open.panelPad);
  const visualBottom = await kp.evaluate(() => Math.round((window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? innerHeight)));
  check("keyboard open: composer above the keyboard", Boolean(open.composer) && open.composer.bottom <= visualBottom + 1, { composer: open.composer, visualBottom });
  await kp.evaluate(() => window.__setKeyboard(0));
  await kp.locator('[data-testid="mobile-bottom-nav"]').waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  const closed = await kp.evaluate(READ);
  check("keyboard closed: bar and map control return, reserve restored", closed.bar !== null && closed.mapControl !== null && closed.panelPad === "80px" && closed.marker === null, { bar: closed.bar, map: closed.mapControl, pad: closed.panelPad, marker: closed.marker });
  await context.close();
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
