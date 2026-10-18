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
 *   2. A renter asking "2BR in Laureles under 2 million pesos" gets results AND an honest
 *      "I can't filter by monthly budget yet" line (the #386 fix). A silent $2/night cap
 *      would fail this.
 *   3. An invalid viewing request returns HTTP 400 with safe renter copy and no SQL text.
 *   4. GitHub's production deployment for this repo matches main, allowing a grace window
 *      right after a merge.
 *
 * Env: SMOKE_BASE_URL, GITHUB_REPOSITORY, GITHUB_TOKEN, SHA_GRACE_MINUTES, SMOKE_CHANNEL.
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";

const BASE = (process.env.SMOKE_BASE_URL || "https://www.mdeai.co").replace(/\/$/, "");
const REPO = process.env.GITHUB_REPOSITORY || "amoai-tech/mdeai";
const TOKEN = process.env.GITHUB_TOKEN || "";
const GRACE_MINUTES = Number(process.env.SHA_GRACE_MINUTES || "20");
const RENTAL_QUERY = process.env.SMOKE_QUERY || "2BR in Laureles under 2 million pesos";

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

async function servedFingerprint() {
  const res = await fetch(BASE + "/chat", { headers: { "Cache-Control": "no-cache" } });
  const html = await res.text();
  const chunks = Array.from(
    new Set(html.match(/\/_next\/static\/chunks\/[^"']+\.js/g) || []),
  ).sort();
  const fingerprint = createHash("sha256").update(chunks.join("\n")).digest("hex").slice(0, 16);
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
const DISCLOSED = /can't filter by monthly budget|budget was not applied/i;

async function rentalFastPath() {
  const browser = await chromium.launch({
    channel: process.env.SMOKE_CHANNEL || undefined,
    headless: true,
  });
  let text = "";
  let cards = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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
    text = await page.locator("body").innerText();
    cards = await page.locator('[data-testid="rental-card"]').count();
  } finally {
    await browser.close();
  }
  return {
    answered: ANSWERED.test(text),
    empty: EMPTY.test(text),
    disclosed: DISCLOSED.test(text),
    cards,
  };
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

  const rentals = await rentalFastPath();
  record(
    "rental fast path answers (results or honest empty state)",
    rentals.answered,
    rentals.empty ? "empty state shown" : "rental cards rendered: " + rentals.cards,
  );
  record(
    "peso budget is disclosed, never silently capped",
    rentals.disclosed,
    "budget disclosure present: " + rentals.disclosed,
  );

  const shas = await deploymentDrift();
  printSummary(served, shas);

  const failed = results.filter((entry) => !entry.ok);
  if (failed.length > 0) {
    console.error(failed.length + " production check(s) failed");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("production behaviour smoke crashed:", err);
  process.exit(1);
});
