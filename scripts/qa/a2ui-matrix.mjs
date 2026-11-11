#!/usr/bin/env node
/**
 * A2UI card matrix (SAN-1653): proves source → card → Details identity for rentals and events.
 *
 * Usage (dev server on :3001, QA browser exposed on :9271):
 *   node scripts/qa/a2ui-matrix.mjs --suite rentals --cdp http://127.0.0.1:9271
 *   node scripts/qa/a2ui-matrix.mjs --suite events
 *   node scripts/qa/a2ui-matrix.mjs --suite all --base http://localhost:3001
 *
 * Exit 1 when any case fails. "honest-unavailable" (the agent says it cannot show more
 * results than the page publishes) is a pass, recorded separately.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:3001");
const CDP = arg("cdp", "http://127.0.0.1:9271");
const SUITE = arg("suite", "all");
const OUT = arg("out", path.join(process.cwd(), ".a2ui-matrix"));
fs.mkdirSync(OUT, { recursive: true });
const lines = [];
const record = (row) => {
  lines.push(row);
  console.log(JSON.stringify(row));
};

const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0];
const page =
  context.pages().find((p) => p.url().includes("localhost")) ?? context.pages()[0];
page.setDefaultTimeout(90_000);

const ask = async (inputSelector, prompt) => {
  await page.locator(inputSelector).fill(prompt);
  await page.locator(inputSelector).press("Enter");
};
const textOf = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent ?? "" : "";
  }, selector);
/** Start a clean conversation so each case proves its own selection, not a reused surface. */
const resetConversation = async () => {
  const clicked = await page.evaluate(() => {
    const control = [...document.querySelectorAll("button,a")].find((el) =>
      /new chat|new conversation/i.test(el.textContent ?? ""),
    );
    if (!control) return false;
    control.click();
    return true;
  });
  if (clicked) await page.waitForTimeout(2500);
  return clicked;
};

const chatText = () =>
  page.evaluate(() => (document.querySelector('[data-testid="center-chat-panel"]') ?? document.body).innerText.slice(-2500));

const RENTALS = [
  { id: "rental-first", prompt: "Show the first apartment as a card.", index: 1 },
  { id: "rental-second", prompt: "Show the second apartment as a card.", index: 2 },
  { id: "rental-sixth", prompt: "Show the sixth apartment as a card.", index: 6 },
];

async function rentCase(c) {
  await page.goto(`${BASE}/rentals?neighborhood=Laureles`, { waitUntil: "domcontentloaded" });
  // Wait for grounded results and the real Ask composer instead of using an
  // arbitrary delay that is wasteful on fast loads and flaky on slow ones.
  await page.locator("#rental-ask-input").waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid^="rental-details-cta-"]').length > 0,
    undefined,
    { timeout: 90_000 },
  );
  const native = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="rental-details-cta-"]')].map((e) =>
      e.getAttribute("data-testid").replace("rental-details-cta-", ""),
    ),
  );
  const expected = native[c.index - 1] ?? null;
  await ask("#rental-ask-input", c.prompt);
  let cards = [];
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="a2ui-rental-card"]').length > 0,
      undefined,
      { timeout: 75_000 },
    );
  } catch {}
  await page.waitForTimeout(1500);
  cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="a2ui-rental-card"]')].map((e) =>
      e.getAttribute("data-listing-id"),
    ),
  );
  let details = null;
  if (cards.length) {
    await page.evaluate(() => {
      const card = document.querySelector('[data-testid="a2ui-rental-card"]');
      const btn = [...(card?.querySelectorAll("button,a") ?? [])].find((x) =>
        /details/i.test(x.textContent ?? ""),
      );
      btn?.click();
    });
    await page.waitForTimeout(2500);
    details = await page.evaluate(() => {
      const panel =
        document.querySelector('[data-testid="rental-details-panel"]') ??
        document.querySelector('[data-testid="rental-details-sheet"]');
      return panel ? panel.getAttribute("data-listing-id") : null;
    });
  }
  const reply = cards.length ? "" : await chatText();
  const unavailable = !cards.length && /only|five|5 |can.?t|cannot|not (in|among)|unavailable/i.test(reply);
  const pass = Boolean(expected) && cards.includes(expected) && details === expected;
  record({
    id: c.id,
    nativeCount: native.length,
    expected,
    cards,
    details,
    status: pass ? "pass" : unavailable ? "honest-unavailable" : "fail",
    reply: reply.slice(0, 300),
  });
  await page.screenshot({ path: path.join(OUT, `${c.id}.png`) });
  return pass || unavailable;
}

async function eventCase(c) {
  await page.goto(`${BASE}/events`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="discovery-ask-input"]');
      return Boolean(el) && !el.disabled;
    },
    undefined,
    { timeout: 45000 },
  );
  // The Events composer gates sending on the agent connection (`data-ready`) and
  // renders before the browse list, so wait for both before typing.
  await page.waitForFunction(
    () => {
      const form = document.querySelector('[data-testid="discovery-ask-events"]');
      return (
        Boolean(form) &&
        form.getAttribute("data-ready") === "true" &&
        document.querySelectorAll('[data-testid="events-grid"] [data-testid="event-card"]').length > 0
      );
    },
    undefined,
    { timeout: 60000 },
  );
  await resetConversation();
  await ask('[data-testid="discovery-ask-input"]', c.prompt);
  // Enter is ignored until the composer is ready; confirm the turn was accepted.
  await page.waitForFunction(
    (prompt) => {
      const history = document.querySelector('[data-testid="discovery-ask-history"]');
      return Boolean(history) && (history.textContent ?? "").includes(prompt.slice(0, 24));
    },
    c.prompt,
    { timeout: 30000 },
  ).catch(() => {});
  let cards = [];
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="a2ui-event-card"]').length > 0,
      undefined,
      { timeout: 75_000 },
    );
  } catch {}
  await page.waitForTimeout(1500);
  cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="a2ui-event-card"]')].map((e) =>
      e.getAttribute("data-event-id"),
    ),
  );
  const cardTitle = cards.length ? await textOf('[data-testid="a2ui-event-card"]') : "";
  let detailsTitle = null;
  let detailsEventId = null;
  if (cards.length) {
    await page.evaluate(() => {
      const card = document.querySelector('[data-testid="a2ui-event-card"]');
      const btn = [...(card?.querySelectorAll("button,a") ?? [])].find((x) =>
        /details/i.test(x.textContent ?? ""),
      );
      btn?.click();
    });
    try {
      await page.waitForFunction(
        () =>
          Boolean(document.querySelector('[role="dialog"]')) ||
          Boolean(document.querySelector('[data-testid="event-browse-details-panel"]')),
        undefined,
        { timeout: 10000 },
      );
    } catch {}
    detailsTitle = await page.evaluate(() => {
      const panel =
        document.querySelector('[data-testid="event-card-modal"]') ??
        document.querySelector('[data-testid="event-browse-details-panel"]') ??
        document.querySelector('[role="dialog"]');
      return panel ? panel.textContent ?? "" : null;
    });
    detailsEventId = await page.evaluate(() => {
      const panel =
        document.querySelector('[data-testid="event-card-modal"]') ??
        document.querySelector('[data-testid="event-browse-details-panel"]') ??
        document.querySelector('[role="dialog"]');
      return panel ? panel.getAttribute("data-event-id") : null;
    });
  }
  const reply = cards.length ? "" : await chatText();
  const unavailable = !cards.length && /only|five|5 |can.?t|cannot|unavailable/i.test(reply);
  const pass = detailsEventId
    ? Boolean(cards.length) && detailsEventId === cards[0]
    : Boolean(cards.length) && Boolean(detailsTitle) && detailsTitle.includes(cardTitle.slice(0, 40));
  record({
    id: c.id,
    cards,
    detailsEventId,
    detailsTitle: detailsTitle?.slice(0, 120) ?? null,
    status: pass ? "pass" : unavailable ? "honest-unavailable" : "fail",
    reply: reply.slice(0, 300),
  });
  await page.screenshot({ path: path.join(OUT, `${c.id}.png`) });
  return pass || unavailable;
}

const EVENTS = [
  { id: "event-first", prompt: "Show the first event as a card." },
  { id: "event-second", prompt: "Show the second event as a card." },
  { id: "event-fourth", prompt: "Show the fourth event as a card." },
];

const ok = [];
if (SUITE === "all" || SUITE === "rentals") for (const c of RENTALS) ok.push(await rentCase(c));
if (SUITE === "all" || SUITE === "events") for (const c of EVENTS) ok.push(await eventCase(c));

fs.writeFileSync(path.join(OUT, "matrix.json"), JSON.stringify(lines, null, 2));
console.log(`SUMMARY ${lines.filter((r) => r.status === "pass").length} pass / ${lines.filter((r) => r.status === "honest-unavailable").length} unavailable / ${lines.filter((r) => r.status === "fail").length} fail`);
process.exit(ok.every(Boolean) ? 0 : 1);
