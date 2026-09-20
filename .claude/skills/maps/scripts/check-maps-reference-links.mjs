#!/usr/bin/env node
import { readFile } from "node:fs/promises";

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

const timeoutMs = Number(process.env.MAPS_LINK_TIMEOUT_MS ?? 12000);
const failures = [];
for (const { url } of primary) {
  const target = url.split("#")[0];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(target, { method: "HEAD", redirect: "manual", signal: controller.signal });
    if ([403, 405].includes(response.status)) {
      response = await fetch(target, { method: "GET", redirect: "manual", signal: controller.signal });
      await response.body?.cancel();
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        failures.push(`${url} -> redirect missing Location header (${response.status})`);
        continue;
      }
      const from = new URL(target);
      const to = new URL(location, from);
      const localeOnly =
        from.origin === to.origin &&
        from.pathname === to.pathname &&
        [...to.searchParams.keys()].every((key) => key === "hl");
      if (localeOnly) console.log(`REDIRECT_LOCALE ${response.status} ${url} -> ${location}`);
      else failures.push(`${url} -> redirect ${response.status} ${location}`.trim());
    } else if (!response.ok) {
      failures.push(`${url} -> HTTP ${response.status}`);
    } else {
      console.log(`OK ${response.status} ${url}`);
    }
  } catch (error) {
    failures.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

if (failures.length) {
  console.error(`REFERENCE_LINK_FAILURES=${failures.length}`);
  for (const failure of failures) console.error(failure);
  process.exit(2);
}
console.log(`REFERENCE_LINKS_OK=${primary.length}`);
