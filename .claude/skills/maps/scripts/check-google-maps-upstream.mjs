#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SKILL = ".claude/skills/maps/SKILL.md";
const UPSTREAM = "https://github.com/googlemaps/agent-skills.git";

function pinnedCommit() {
  const body = readFileSync(SKILL, "utf8");
  const match = body.match(/Reviewed upstream commit: `([0-9a-f]{40})`/i);
  if (!match) throw new Error(`Pinned Google Maps upstream commit missing from ${SKILL}`);
  return match[1].toLowerCase();
}

function currentCommit(args) {
  const i = args.indexOf("--current");
  if (i >= 0) {
    const value = args[i + 1];
    if (!/^[0-9a-f]{40}$/i.test(value ?? "")) throw new Error("--current requires a 40-character commit SHA");
    return value.toLowerCase();
  }
  const out = execFileSync("git", ["ls-remote", UPSTREAM, "refs/heads/main"], { encoding: "utf8" }).trim();
  const sha = out.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/i.test(sha ?? "")) throw new Error("Could not resolve googlemaps/agent-skills main");
  return sha.toLowerCase();
}

try {
  const pinned = pinnedCommit();
  const current = currentCommit(process.argv.slice(2));
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
