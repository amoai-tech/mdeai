#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fetchWithRetry } from "./network-retry.mjs";

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
  console.error("REFERENCE_LINK_FAILURES=1");
  console.error("reference-index.md -> no primary references selected");
  process.exit(2);
}

const timeoutMs = Number(process.env.MAPS_LINK_TIMEOUT_MS ?? 12000);
const attempts = Number(process.env.MAPS_NETWORK_RETRIES ?? 3);
const failures = [];

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
      failures.push(`${url} -> HTTP ${response.status}`);
      continue;
    }
    if (response.url && response.url !== target) console.log(`REDIRECT_OK ${url} -> ${response.url}`);
    else console.log(`OK ${response.status} ${url}`);
  } catch (error) {
    failures.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  console.error(`REFERENCE_LINK_FAILURES=${failures.length}`);
  for (const failure of failures) console.error(failure);
  process.exit(2);
}
console.log(`REFERENCE_LINKS_OK=${primary.length}`);
