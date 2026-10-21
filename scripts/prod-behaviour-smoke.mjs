#!/usr/bin/env node
/**
 * Production behaviour smoke.
 *
 * The deployment status says "Ready"; this checks what www.mdeai.co actually does, and
 * prints the served build fingerprint so a stale artifact is identifiable when a check
 * fails. Run every 30 minutes by .github/workflows/prod-behaviour-smoke.yml.
 *
 * Checks
 *   1. /chat is served with a real next build chunk list (fingerprint = etag + chunk hash).
 *   2. A renter asking "2BR in Laureles under 2 million pesos" gets results or an honest
 *      empty state, sends `maxPriceMonthly: 2000000` (never a $2/night cap), and is told
 *      which monthly budget was applied.
 *   3. An invalid viewing request returns HTTP 400 with safe renter copy and no SQL text.
 *   4. GitHub's production deployment for this repo matches main, allowing a grace window
 *      right after a merge.
 *
 * Env: SMOKE_BASE_URL, GITHUB_REPOSITORY, GITHUB_TOKEN, SHA_GRACE_MINUTES, SMOKE_CHANNEL.
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const BASE = (process.env.SMOKE_BASE_URL || "https://www.mdeai.co").replace(/\/$/, "");
const REPO = process.env.GITHUB_REPOSITORY || "amoai-tech/mdeai";
const TOKEN = process.env.GITHUB_TOKEN || "";
const GRACE_MINUTES = Number(process.env.SHA_GRACE_MINUTES || "20");
const RENTAL_QUERY = process.env.SMOKE_QUERY || "2BR in Laureles under 2 million pesos";
// Keep in sync with SMOKE_QUERY: the default query asks for 2 million COP per month.
const EXPECTED_MONTHLY = Number(process.env.SMOKE_MONTHLY_BUDGET || "2000000");
const EXPECTED_CURRENCY = process.env.SMOKE_MONTHLY_CURRENCY || "COP";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
}

async function ghApi(path) {
  const headers = { Accept: "application/vnd.github+json" };
  if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
  try {
    const res = await fetch("https://api.github.com" + path, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Sorted chunk list plus a short hash, so a served build is identifiable across runs. */
export function chunkFingerprint(source) {
  // Built per call: there is no shared `lastIndex` to reason about. It also stays a string,
  // because a regex literal containing quotes desyncs Codacy's JS parser.
  const pattern = new RegExp("/_next/static/chunks/[^\"']+\\.js", "g");
  const chunks = Array.from(new Set(source.match(pattern) || [])).sort();
  return {
    chunks,
    fingerprint: createHash("sha256").update(chunks.join("\n")).digest("hex").slice(0, 16),
  };
}

async function servedFingerprint() {
  const res = await fetch(BASE + "/chat", { headers: { "Cache-Control": "no-cache" } });
  const pageSource = await res.text();
  const { chunks, fingerprint } = chunkFingerprint(pageSource);
  return {
    ok: res.ok,
    status: res.status,
    etag: res.headers.get("etag") || "none",
    chunks: chunks.length,
    fingerprint,
  };
}

async function safeViewingError() {
  const res = await fetch(BASE + "/api/leads/schedule-viewing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      listingId: "prod-behaviour-smoke-does-not-exist",
      listingTitle: "Production behaviour smoke (non-existent listing)",
      neighborhood: "Laureles",
      name: "Production Smoke",
      email: "prod-behaviour-smoke@example.com",
      preferredAt: "2099-06-01T15:00",
    }),
  });
  const json = await res.json().catch(() => ({}));
  const payload = JSON.stringify(json);
  const message = json && json.error ? json.error.message || "" : "";
  const safe =
    res.status === 400 &&
    json &&
    json.error &&
    json.error.code === "VALIDATION_ERROR" &&
    /try again/i.test(message) &&
    !/p1_schedule|constraint|duplicate key|postgres|violates/i.test(payload);
  return { ok: safe, detail: "HTTP " + res.status + " " + JSON.stringify(json) };
}

const ANSWERED = /Found \d+ rentals?|No rentals match|No rentals are available/i;
const EMPTY = /No rentals match|No rentals are available/i;
// Built from a string: the apostrophe in a regex literal desyncs Codacy's JS parser and makes
// it attribute the rest of the file to the previous function.
// Monthly budgets are now applied (SAN-1502). The disclosure must therefore say the budget
// was applied — the old "can't filter by monthly budget" wording is only valid when it was not.
// Requires the applied amount and currency, or an explicit statement that the budget was not
// applied. Generic "monthly budget" text on a card is not a disclosure.
export function disclosureMatches(text, expectedMonthly, expectedCurrency) {
  const lower = String(text).toLowerCase();
  if (lower.includes("can't filter by monthly budget") || lower.includes("budget was not applied")) {
    return true;
  }
  // Parse without a regex: the page text is untrusted, and a backtracking pattern here has no
  // value. Format is exactly "Applied budget: COP 2,000,000 per month."
  const marker = "applied budget:";
  const start = lower.indexOf(marker);
  if (start === -1) return false;
  const rest = text.slice(start + marker.length).trimStart();
  const currencyEnd = rest.indexOf(" ");
  if (currencyEnd === -1) return false;
  const currency = rest.slice(0, currencyEnd).toUpperCase();
  let i = currencyEnd;
  while (rest[i] === " ") i += 1;
  let j = i;
  while (j < rest.length && rest[j] !== " ") j += 1;
  const amount = Number(rest.slice(i, j).replace(/,/g, ""));
  // The period is part of the disclosure: "per night" must never satisfy a monthly check.
  while (rest[j] === " ") j += 1;
  let periodEnd = j;
  while (periodEnd < rest.length && rest[periodEnd] !== " ") periodEnd += 1;
  const per = rest.slice(j, periodEnd).toLowerCase();
  while (rest[periodEnd] === " ") periodEnd += 1;
  let unitEnd = periodEnd;
  while (unitEnd < rest.length && rest[unitEnd] !== " ") unitEnd += 1;
  let unit = rest.slice(periodEnd, unitEnd).toLowerCase();
  while (unit.endsWith(".") || unit.endsWith(",")) unit = unit.slice(0, -1);
  return (
    currency === expectedCurrency.toUpperCase() &&
    amount === expectedMonthly &&
    per === "per" &&
    unit === "month"
  );
}

/**
 * The #386 regression was a monthly budget silently converted into a nightly cap. The DOM
 * alone cannot distinguish "applied" from "explained", so this asserts the actual request:
 * a monthly query must carry maxPriceMonthly and no maxPricePerNight cap.
 */
export function classifyMonthlyBudgetRequest(
  payload,
  expectedMonthly = 2_000_000,
  expectedCurrency = "COP",
) {
  const monthly = payload ? payload.maxPriceMonthly : undefined;
  // The API omits an absent nightly cap; `undefined` and `null` both mean "no nightly cap".
  // Do not require an explicit `null`, which the real request payload does not send.
  const nightly = payload ? payload.maxPricePerNight : undefined;
  const currency = payload ? payload.budgetCurrency : undefined;
  const stayType = payload ? payload.stayType : undefined;
  const ok =
    monthly === expectedMonthly &&
    nightly == null &&
    currency === expectedCurrency &&
    stayType === "monthly";
  return {
    ok,
    detail: payload
      ? JSON.stringify({
          maxPriceMonthly: monthly,
          maxPricePerNight: nightly,
          budgetCurrency: currency,
          stayType,
        })
      : "no /api/rentals/search request observed",
  };
}

async function runRentalQuery(browser, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const pageErrors = [];
  let searchRequest = null;
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 200)));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/rentals/search")) {
      try {
        searchRequest = JSON.parse(request.postData() || "{}");
      } catch {
        searchRequest = null;
      }
    }
  });
  try {
    await page.goto(BASE + "/chat", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const box = page.locator('[data-testid="copilot-chat-textarea"]');
    await box.waitFor({ state: "visible", timeout: 45_000 });
    await box.fill(RENTAL_QUERY);
    await page.locator('[data-testid="copilot-send-button"]').click();
    // Results and an honest empty state both count as an answer; a stalled page does not.
    await page.waitForFunction(
      () => /Found \d+ rentals?|No rentals match|No rentals are available/i.test(document.body.innerText),
      null,
      { timeout: 45_000 },
    );
    const text = await page.locator("body").innerText();
    const cards = await page.locator('[data-testid="rental-card"]').count();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    return { text, cards, overflow, pageErrors, searchRequest };
  } finally {
    await context.close();
  }
}

function recordRentalResult(label, query) {
  record(
    label + ": rental fast path answers (results or honest empty state)",
    ANSWERED.test(query.text),
    EMPTY.test(query.text) ? "empty state shown" : "rental cards rendered: " + query.cards,
  );
  const budgetRequest = classifyMonthlyBudgetRequest(
    query.searchRequest,
    EXPECTED_MONTHLY,
    EXPECTED_CURRENCY,
  );
  record(
    label + ": monthly budget is sent as a monthly amount, never a nightly cap",
    budgetRequest.ok,
    budgetRequest.detail,
  );
  record(
    label + ": monthly budget context is disclosed",
    disclosureMatches(query.text, EXPECTED_MONTHLY, EXPECTED_CURRENCY),
    "budget disclosure present: " +
      disclosureMatches(query.text, EXPECTED_MONTHLY, EXPECTED_CURRENCY),
  );
  record(label + ": no uncaught page exceptions", query.pageErrors.length === 0, query.pageErrors.join(" | ") || "none");
}

/** The newest production deployment whose latest GitHub status is success. */
async function latestSuccessfulProductionDeployment() {
  const deployments = await ghApi("/repos/" + REPO + "/deployments?environment=production&per_page=5");
  if (!Array.isArray(deployments) || deployments.length === 0) {
    return { sha: "", note: "no production deployment found" };
  }
  for (const deployment of deployments) {
    const statuses = await ghApi("/repos/" + REPO + "/deployments/" + deployment.id + "/statuses?per_page=1");
    const state = Array.isArray(statuses) && statuses[0] ? statuses[0].state : "unknown";
    if (state === "success") return { sha: deployment.sha, note: "deployment " + deployment.id + " is success" };
  }
  return { sha: "", note: "none of the latest 5 production deployments is successful" };
}

async function deploymentDrift() {
  const deployed = await latestSuccessfulProductionDeployment();
  const mainCommit = await ghApi("/repos/" + REPO + "/commits/main");
  const mainSha = mainCommit && mainCommit.sha ? mainCommit.sha : "";
  if (!deployed.sha || !mainSha) {
    record(
      "production deployment is successful and matches main",
      false,
      deployed.note + "; main=" + (mainSha ? mainSha.slice(0, 9) : "unreadable"),
    );
    return { deployedSha: deployed.sha, mainSha };
  }
  const mainAgeMin = mainCommit.commit
    ? (Date.now() - new Date(mainCommit.commit.committer.date).getTime()) / 60_000
    : Number.POSITIVE_INFINITY;
  if (deployed.sha === mainSha) {
    record("production deployment is successful and matches main", true, deployed.sha.slice(0, 9) + "; " + deployed.note);
  } else if (mainAgeMin < GRACE_MINUTES) {
    record(
      "production deployment is successful and matches main",
      true,
      "WARN main " + mainSha.slice(0, 9) + " is " + Math.round(mainAgeMin) + " min old; serving " + deployed.sha.slice(0, 9) + " (inside the " + GRACE_MINUTES + "-minute merge grace window)",
    );
  } else {
    record(
      "production deployment is successful and matches main",
      false,
      "drift: main is " + mainSha.slice(0, 9) + " (" + Math.round(mainAgeMin) + " min old) but the newest successful deployment is " + deployed.sha.slice(0, 9),
    );
  }
  return { deployedSha: deployed.sha, mainSha };
}

function printSummary(served, shas) {
  for (const entry of results) {
    console.log((entry.ok ? "PASS " : "FAIL ") + entry.name + " — " + entry.detail);
  }
  console.log(
    "served fingerprint=" + served.fingerprint + " etag=" + served.etag + " deployed=" + shas.deployedSha.slice(0, 9) + " main=" + shas.mainSha.slice(0, 9),
  );
}

async function main() {
  const served = await servedFingerprint();
  record(
    "served build fingerprint",
    served.ok && served.chunks > 0,
    "HTTP " + served.status + " etag=" + served.etag + " chunks=" + served.chunks + " fingerprint=" + served.fingerprint,
  );

  const api = await safeViewingError();
  record("viewing errors stay safe and server-side", api.ok, api.detail);

  const browser = await chromium.launch({
    channel: process.env.SMOKE_CHANNEL || undefined,
    headless: true,
  });
  try {
    const desktop = await runRentalQuery(browser, { viewport: { width: 1280, height: 900 } });
    recordRentalResult("desktop", desktop);

    const mobile = await runRentalQuery(browser, {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    recordRentalResult("390px", mobile);
    record("390px has no horizontal overflow", mobile.overflow <= 1, "overflow=" + mobile.overflow + "px");
  } finally {
    await browser.close();
  }

  const shas = await deploymentDrift();
  printSummary(served, shas);

  const failed = results.filter((entry) => !entry.ok);
  if (failed.length > 0) {
    console.error(failed.length + " production check(s) failed");
    process.exit(1);
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((err) => {
    console.error("production behaviour smoke crashed:", err);
    process.exit(1);
  });
}
