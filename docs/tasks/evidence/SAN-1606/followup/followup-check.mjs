/** Review-follow-up evidence for SAN-1606 (comments 1, 2, 6). Read-only layout probes. */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3002";
const browser = await chromium.launch();
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
};

const READ = () => {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height), bottom: Math.round(r.bottom) };
  };
  return {
    path: location.pathname,
    nav: box('[data-testid="mobile-bottom-nav"]'),
    ask: box('[data-testid="workspace-ask-composer"]'),
    resultsColumnPaddingBottom: (() => {
      const el = document.querySelector('[data-testid="workspace-results-column"]');
      return el ? getComputedStyle(el).paddingBottom : null;
    })(),
    composer: box('[data-testid="copilot-chat-input"]'),
    mapTrigger: box('[data-testid="map-sheet-trigger"]'),
    panelPaddingBottom: (() => {
      const el = document.querySelector('[data-testid="center-chat-panel"]');
      return el ? getComputedStyle(el).paddingBottom : null;
    })(),
    clearance: getComputedStyle(document.documentElement).getPropertyValue("--mde-mobile-nav-clearance").trim(),
    noNavMarker: document.documentElement.dataset.mdeNoNav ?? null,
    visualBottom: Math.round(window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : innerHeight),
    innerHeight,
  };
};

// 1) Routes without the bar must not reserve its space (comment 6).
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  for (const path of ["/rentals", "/cafes", "/nightlife"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    // these pages stream a loading skeleton first in dev
    await page
      .locator('[data-testid="workspace-results-column"]')
      .waitFor({ timeout: 45_000 })
      .catch(() => {});
    await page.waitForTimeout(1500);
    const read = await page.evaluate(READ);
    if (path === "/rentals") {
      check("/rentals (bar rendered) reserves one clearance", read.ask?.bottom === 764 && read.resultsColumnPaddingBottom === "80px", read);
    } else {
      // These pages render no Ask composer; the reserve lives on the results column (and would
      // push a sticky composer up if one were mounted).
      check(
        `${path} (no bar) reserves nothing`,
        read.nav === null && read.resultsColumnPaddingBottom === "0px",
        read,
      );
    }
  }
  await context.close();
}

// 2) Overlay keyboard: bar hidden, its reserved space released, trigger/composer above the keyboard.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const state = { keyboard: 0 };
    const listeners = new Set();
    const visualViewport = {
      get width() { return window.innerWidth; },
      get height() { return window.innerHeight - state.keyboard; },
      offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
      addEventListener: (_t, l) => listeners.add(l),
      removeEventListener: (_t, l) => listeners.delete(l),
      dispatchEvent: () => true,
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => visualViewport });
    window.__setKeyboard = (height) => {
      state.keyboard = height;
      for (const listener of listeners) listener(new Event("resize"));
    };
  });
  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector('[data-testid="copilot-chat-textarea"]', { timeout: 60_000 });
  await page.waitForTimeout(2000);

  const before = await page.evaluate(READ);
  check("closed keyboard: bar visible, clearance reserved", before.nav !== null && before.panelPaddingBottom === "80px", before);

  await page.getByTestId("copilot-chat-textarea").focus();
  await page.evaluate(() => window.__setKeyboard(320));
  await page.locator('[data-testid="mobile-bottom-nav"]').waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const open = await page.evaluate(READ);
  check("open keyboard: bar hidden", open.nav === null, open);
  // The release is scoped to the chat viewport, so the panel's padding is the contract (the root
  // token stays defined for every other surface).
  check("open keyboard: reserved space released on /chat", open.panelPaddingBottom === "0px", open);
  check("open keyboard: keyboard-only marker present", open.noNavMarker !== null, open.noNavMarker);
  check(
    "open keyboard: composer above the keyboard",
    Boolean(open.composer) && open.composer.bottom <= open.visualBottom + 1,
    { composer: open.composer, visualBottom: open.visualBottom },
  );
  check(
    "open keyboard: map trigger stays above the lifted composer",
    Boolean(open.mapTrigger) && Boolean(open.composer) && open.mapTrigger.bottom <= open.composer.y,
    { map: open.mapTrigger, composer: open.composer },
  );
  await page.screenshot({ path: "tmp/san1606/shots/verify/390-chat-overlay-keyboard.png" });

  await page.evaluate(() => window.__setKeyboard(0));
  await page.locator('[data-testid="mobile-bottom-nav"]').waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  const closed = await page.evaluate(READ);
  check(
    "closed keyboard again: bar returns and clearance is restored",
    closed.nav !== null && closed.noNavMarker === null && closed.panelPaddingBottom === "80px",
    closed,
  );
  await context.close();
}

await browser.close();
const passed = results.filter((r) => r.pass).length;
console.log(`follow-up checks: ${passed}/${results.length} passed`);
for (const r of results) {
  if (!r.pass) console.log("FAIL", r.name, JSON.stringify(r.detail).slice(0, 400));
}
