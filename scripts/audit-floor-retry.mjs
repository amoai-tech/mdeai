#!/usr/bin/env node
/**
 * Run a critical dependency audit with bounded retries only for registry outages.
 * A missing report is NEVER proof of a clean audit.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as sleepTimeout } from "node:timers/promises";

const TRANSIENT = /(?:\b(?:429|500|502|503|504)\b|service unavailable|econnreset|econnrefused|enotfound|eai_again|etimedout|esockettimedout|fetch failed|socket hang up|audit endpoint returned an error)/i;

export function classifyAudit({ status, stdout = "", stderr = "", error = null }) {
  let report;
  try { report = JSON.parse(stdout); } catch { /* network failures may not return JSON */ }
  const critical = report?.metadata?.vulnerabilities?.critical;
  if (Number.isInteger(critical) && critical >= 0 && !report.error) {
    if (critical > 0) return { kind: "vulnerable", message: String(critical) + " critical vulnerabilities detected" };
    if (status === 0 && !error) return { kind: "pass", message: "complete audit: zero critical vulnerabilities" };
    return { kind: "failure", message: "nonzero audit exit despite zero reported critical vulnerabilities" };
  }
  const detail = [stderr, stdout, report?.error?.code, report?.error?.summary, report?.error?.detail, error?.message].filter(Boolean).join(" ");
  if (error?.code === "ETIMEDOUT" || TRANSIENT.test(detail)) {
    return { kind: "transient", message: "registry audit endpoint unavailable" };
  }
  return { kind: "failure", message: "no complete vulnerability report" };
}

function invokeNpmAudit() {
  return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", [
    "audit", "--audit-level=critical", "--json", "--fetch-retries=0", "--fetch-timeout=20000",
  ], { encoding: "utf8", timeout: 75000, maxBuffer: 16 * 1024 * 1024 });
}

export async function auditWithRetry({ invoke = invokeNpmAudit, sleep = (ms) => sleepTimeout(ms), attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const outcome = classifyAudit(invoke());
    if (outcome.kind === "pass") return { ...outcome, attempt };
    if (outcome.kind !== "transient") throw new Error("Audit failed: " + outcome.message + " (attempt " + attempt + "/" + attempts + ")");
    if (attempt === attempts) throw new Error("Audit blocked: registry unavailable after " + attempts + " attempts; security gate remains failed");
    console.error("Registry audit unavailable, retrying (" + attempt + "/" + attempts + ")");
    await sleep(attempt * 2000);
  }
  throw new Error("Audit ended without security proof");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  auditWithRetry().then(({message, attempt}) => {
    console.log("audit:floor PASS — " + message + " (attempt " + attempt + ")");
  }).catch((error) => {
    console.error("audit:floor FAIL — " + error.message);
    process.exitCode = 1;
  });
}
