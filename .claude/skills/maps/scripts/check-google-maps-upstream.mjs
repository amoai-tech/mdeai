#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { retryOperation } from "./network-retry.mjs";

const execFileAsync = promisify(execFile);
const SKILL = ".claude/skills/maps/SKILL.md";
const UPSTREAM = "https://github.com/googlemaps/agent-skills.git";

function pinnedCommit() {
  const body = readFileSync(SKILL, "utf8");
  const match = body.match(/Reviewed upstream commit: `([0-9a-f]{40})`/i);
  if (!match) throw new Error(`Pinned Google Maps upstream commit missing from ${SKILL}`);
  return match[1].toLowerCase();
}

async function currentCommit(args) {
  const i = args.indexOf("--current");
  if (i >= 0) {
    const value = args[i + 1];
    if (!/^[0-9a-f]{40}$/i.test(value ?? "")) throw new Error("--current requires a 40-character commit SHA");
    return value.toLowerCase();
  }

  const attempts = Number(process.env.MAPS_NETWORK_RETRIES ?? 3);
  const { stdout } = await retryOperation(
    () => execFileAsync("git", ["ls-remote", UPSTREAM, "refs/heads/main"], { encoding: "utf8", timeout: 15000 }),
    {
      attempts,
      delayMs: 500,
      onRetry: (error, attempt) => console.error(`UPSTREAM_RETRY attempt=${attempt} ${error.message}`),
    },
  );
  const sha = stdout.trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/i.test(sha ?? "")) throw new Error("Could not resolve googlemaps/agent-skills main");
  return sha.toLowerCase();
}

try {
  const pinned = pinnedCommit();
  const current = await currentCommit(process.argv.slice(2));
  if (pinned === current) {
    console.log(`UP_TO_DATE pinned=${pinned}`);
    process.exit(0);
  }
  console.error(`DRIFT pinned=${pinned} current=${current}`);
  console.error("Review upstream changes manually; do not overwrite the MDE skill automatically.");
  process.exit(2);
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
