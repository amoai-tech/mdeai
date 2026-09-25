#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./network-retry.mjs";
import {
  MAPS_CHECK_CLASSES,
  classifyFetchError,
  classifyHttpStatus,
  reportCheckSummary,
  resolveCheckMode,
} from "./check-classification.mjs";

const CHECK = "maps-reference-links";
const mode = resolveCheckMode(process.env.MAPS_CHECK_MODE);

function finish(classifications) {
  const { line, exitCode } = reportCheckSummary(CHECK, mode, classifications);
  console.log(line);
  process.exit(exitCode);
}

const indexPath = new URL("../references/reference-index.md", import.meta.url);
const body = await readFile(indexPath, "utf8");
const rows = body.split("\n").filter((line) => line.startsWith("| ["));
const primary = rows.flatMap((line) => {
  const match = line.match(/\]\((https:\/\/[^)]+)\).*\|\s*(\d+)\/10\s*\|\s*$/);
  if (!match) return [];
  const score = Number(match[2]);
  const authority = line.split("|")[2]?.trim() ?? "";
  if (score < 9 || !/(Google|Canonical)/i.test(authority)) return [];
  return [{ url: match[1], authority, score }];
});

if (primary.length === 0) {
  // The local index contract is broken, not an external outage.
  console.error("REFERENCE_LINK_FAILURES=1");
  console.error("reference-index.md -> no primary references selected");
  finish([MAPS_CHECK_CLASSES.BROKEN_REFERENCE]);
}

const timeoutMs = Number(process.env.MAPS_LINK_TIMEOUT_MS ?? 12000);
const attempts = Number(process.env.MAPS_NETWORK_RETRIES ?? 3);
const failures = [];
const classifications = [];

for (const { url } of primary) {
  const target = url.split("#")[0];
  const retry = {
    attempts,
    delayMs: 350,
    timeoutMs,
    onRetry: (error, attempt) => console.error(`LINK_RETRY attempt=${attempt} ${url} ${error.message}`),
  };
  try {
    let response = await fetchWithRetry(target, { method: "HEAD", redirect: "follow" }, retry);
    if ([403, 405].includes(response.status)) {
      response = await fetchWithRetry(target, { method: "GET", redirect: "follow" }, retry);
      await response.body?.cancel();
    }
    if (!response.ok) {
      const classification = classifyHttpStatus(response.status);
      classifications.push(classification);
      failures.push(`${classification} ${url} -> HTTP ${response.status}`);
      console.error(`${classification} ${url} -> HTTP ${response.status}`);
      continue;
    }
    // A followed redirect still resolves, so it is not a failure — but it is
    // reported so a moved canonical URL stays visible in the maintenance log.
    classifications.push(MAPS_CHECK_CLASSES.OK);
    if (response.url && response.url !== target) console.log(`REDIRECT_OK ${url} -> ${response.url}`);
    else console.log(`OK ${response.status} ${url}`);
  } catch (error) {
    const classification = classifyFetchError(error);
    classifications.push(classification);
    failures.push(`${classification} ${url} -> ${error instanceof Error ? error.message : String(error)}`);
    console.error(`${classification} ${url} -> ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error(`REFERENCE_LINK_FAILURES=${failures.length}`);
  finish(classifications);
}
console.log(`REFERENCE_LINKS_OK=${primary.length}`);
finish(classifications);
