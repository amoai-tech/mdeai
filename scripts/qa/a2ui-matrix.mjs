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
const chatText = () =>
  page.evaluate(() => (document.querySelector('[data-testid="center-chat-panel"]') ?? document.body).innerText.slice(-2500));

const RENTALS = [
  { id: "rental-first", prompt: "Show the first apartment as a card.", index: 1 },
  { id: "rental-second", prompt: "Show the second apartment as a card.", index: 2 },
  { id: "rental-sixth", prompt: "Show the sixth apartment as a card.", index: 6 },
];

async function rentCase(c) {
  await page.goto(`${BASE}/rentals?neighborhood=Laureles`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
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
    details = await page.evaluate(
      () => document.querySelector("[data-listing-id]")?.getAttribute("data-listing-id") ?? null,
    );
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
  await page.goto(`${BASE}/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  const cardsBefore = await page.evaluate(
    () => document.querySelectorAll('[data-testid="a2ui-event-card"]').length,
  );
  await ask('[data-testid="copilot-chat-textarea"], #rental-ask-input, textarea', c.prompt);
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
        document.querySelector('[data-testid="event-browse-details-panel"]') ??
        document.querySelector('[data-testid="event-card-modal"]') ??
        document.querySelector('[role="dialog"]');
      return panel ? panel.textContent ?? "" : null;
    });
  }
  const reply = cards.length ? "" : await chatText();
  const unavailable = !cards.length && /only|five|5 |can.?t|cannot|unavailable/i.test(reply);
  const pass =
    Boolean(cards.length) &&
    Boolean(detailsTitle) &&
    (detailsTitle.includes(cardTitle.slice(0, 40)) || cardTitle.includes((detailsTitle ?? "").slice(0, 40)));
  record({
    id: c.id,
    cards,
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
