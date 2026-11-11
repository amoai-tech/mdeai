#!/usr/bin/env node
/**
 * A2UI card matrix (SAN-1653): proves source → card → Details identity for rentals and events.
 *
 * Usage (dev server on :3001, one authenticated QA browser on the fixed port :9280):
 *   node scripts/qa/a2ui-matrix.mjs --suite rentals
 *   node scripts/qa/a2ui-matrix.mjs --suite events --only event-second
 *   node scripts/qa/a2ui-matrix.mjs --suite all --base http://localhost:3001
 *
 * Exit codes are distinct on purpose:
 *   0  every case passed
 *   2  no failure, but at least one requested result was genuinely absent from the
 *      published source and the assistant said so ("honest-unavailable"). The
 *      `rental-sixth` and `event-fourth` cases are designed to produce this when a
 *      page publishes fewer rows. Callers must accept 2 as green.
 *   1  at least one real failure (wrong id, wrong Details, refusal for an available
 *      result, render error).
 *
 * A non-zero exit is therefore not automatically a red build: only 1 is red.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://localhost:3001");
// Fixed QA browser port: reuse one authenticated browser for the whole session
// instead of starting/killing one per run.
const CDP = arg("cdp", "http://127.0.0.1:9280");
const SUITE = arg("suite", "all");
const ONLY = arg("only", "");
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
    await page.waitForFunction(
      () => {
        const panel =
          document.querySelector('[data-testid="rental-details-panel"]') ??
          document.querySelector('[data-testid="rental-details-sheet"]');
        return Boolean(panel && panel.getAttribute("data-listing-id"));
      },
      undefined,
      { timeout: 15000 },
    ).catch(() => {});
    details = await page.evaluate(() => {
      const panel =
        document.querySelector('[data-testid="rental-details-panel"]') ??
        document.querySelector('[data-testid="rental-details-sheet"]');
      return panel ? panel.getAttribute("data-listing-id") : null;
    });
  }
  const reply = cards.length ? "" : await chatText();
  // Rentals have no published title list; the requested result is absent when the
  // page exposes fewer rows than the requested position. A refusal for a row that
  // exists is a failure, not an honest-unavailable pass.
  const requestedAbsent = Boolean(c.index) && native.length > 0 && c.index > native.length;
  const unavailable =
    !cards.length &&
    requestedAbsent &&
    /only|no (?:other|more|second|third|fourth|sixth)|can.?t|cannot|not (?:in|among)|unavailable|\d+ (?:apartments?|results?) (?:were|was) (?:returned|found)/i.test(reply);
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
  const sourceIds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="events-grid"] [data-testid="event-card"]')].map((card) =>
      card.getAttribute("data-event-id"),
    ),
  );
  const sourceTitles = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="events-grid"] [data-testid="event-card"]')].map((card) =>
      (card.querySelector("h3")?.textContent ?? card.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60),
    ),
  );
  const expectedTitle = c.index ? sourceTitles[c.index - 1] ?? null : null;
  const expectedSourceId = c.index ? sourceIds[c.index - 1] ?? null : null;
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
  // Assert the card for the *requested* event when the grid gave us its id.
  const targetId = expectedSourceId ?? cards[0] ?? null;
  const cardTitle = targetId
    ? await page.evaluate((id) => {
        const card = document.querySelector(`[data-testid="a2ui-event-card"][data-event-id="${id}"]`);
        return (card?.textContent ?? "").replace(/\s+/g, " ").trim();
      }, targetId)
    : "";
  let detailsTitle = null;
  let detailsEventId = null;
  if (cards.length) {
    await page.evaluate((id) => {
      const card =
        (id ? document.querySelector(`[data-testid="a2ui-event-card"][data-event-id="${id}"]`) : null) ??
        document.querySelector('[data-testid="a2ui-event-card"]');
      const btn = [...(card?.querySelectorAll("button,a") ?? [])].find((x) =>
        /details/i.test(x.textContent ?? ""),
      );
      btn?.click();
    }, targetId);
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
        document.querySelector('[data-testid="event-browse-details-sheet"]') ??
        document.querySelector('[role="dialog"]');
      return panel ? panel.textContent ?? "" : null;
    });
    detailsEventId = await page.evaluate(() => {
      const panel =
        document.querySelector('[data-testid="event-card-modal"]') ??
        document.querySelector('[data-testid="event-browse-details-panel"]') ??
        document.querySelector('[data-testid="event-browse-details-sheet"]') ??
        document.querySelector('[role="dialog"]');
      return panel ? panel.getAttribute("data-event-id") : null;
    });
  }
  const reply = cards.length ? "" : await chatText();
  // Events: the requested result must be genuinely absent from the published grid,
  // and the reply must name that limitation; a refusal for an available event fails.
  const requestedAbsent = Boolean(c.index) && sourceIds.length > 0 && c.index > sourceIds.length;
  const unavailable =
    !cards.length &&
    requestedAbsent &&
    /only|no (?:other|more|second|third|fourth)|can.?t|cannot|not (?:in|among)|unavailable|\d+ events? (?:were|was) (?:returned|found)/i.test(reply);
  const titleMatchesRequested = expectedTitle
    ? cardTitle.includes(expectedTitle.slice(0, 30))
    : true;
  // Prefer exact ID equality against the requested source event; fall back to the
  // title comparison only when the grid exposes no id (older cached markup).
  const pass = expectedSourceId
    ? Boolean(cards.length) && cards.includes(expectedSourceId) && detailsEventId === expectedSourceId
    : Boolean(cards.length) &&
      titleMatchesRequested &&
      (detailsEventId
        ? detailsEventId === cards[0]
        : Boolean(detailsTitle) && detailsTitle.includes(cardTitle.slice(0, 40)));
  record({
    id: c.id,
    expectedSourceTitle: expectedTitle,
    expectedSourceId,
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
  { id: "event-first", prompt: "Show the first event as a card.", index: 1 },
  { id: "event-second", prompt: "Show the second event as a card.", index: 2 },
  { id: "event-fourth", prompt: "Show the fourth event as a card.", index: 4 },
];

const ok = [];
const pick = (list) => (ONLY ? list.filter((c) => c.id === ONLY) : list);
if (SUITE === "all" || SUITE === "rentals") for (const c of pick(RENTALS)) ok.push(await rentCase(c));
if (SUITE === "all" || SUITE === "events") for (const c of pick(EVENTS)) ok.push(await eventCase(c));

fs.writeFileSync(path.join(OUT, "matrix.json"), JSON.stringify(lines, null, 2));
const failed = lines.filter((r) => r.status === "fail").length;
const unavailable = lines.filter((r) => r.status === "honest-unavailable").length;
console.log(`SUMMARY ${lines.filter((r) => r.status === "pass").length} pass / ${unavailable} unavailable / ${failed} fail`);
// Exit codes are distinct so CI can allow honest-unavailable explicitly:
// 0 = every case passed, 2 = no failures but some results were genuinely absent,
// 1 = at least one failure.
process.exit(failed > 0 ? 1 : unavailable > 0 ? 2 : 0);
