#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { retryOperation } from "./network-retry.mjs";
import {
  MAPS_CHECK_CLASSES,
  classifyFetchError,
  reportCheckSummary,
  resolveCheckMode,
} from "./check-classification.mjs";

const execFileAsync = promisify(execFile);
const SKILL = ".claude/skills/maps/SKILL.md";
const UPSTREAM = "https://github.com/googlemaps/agent-skills.git";
const CHECK = "google-maps-upstream";

/** Attach a classification to an error so the catch block can report it faithfully. */
function classified(error, classification) {
  error.classification = classification;
  return error;
}

function pinnedCommit() {
  const body = readFileSync(SKILL, "utf8");
  const match = body.match(/Reviewed upstream commit: `([0-9a-f]{40})`/i);
  if (!match) {
    // The local contract is broken: the SKILL must record the reviewed commit.
    throw classified(
      new Error(`Pinned Google Maps upstream commit missing from ${SKILL}`),
      MAPS_CHECK_CLASSES.BROKEN_REFERENCE,
    );
  }
  return match[1].toLowerCase();
}

async function currentCommit(args) {
  const i = args.indexOf("--current");
  if (i >= 0) {
    const value = args[i + 1];
    if (!/^[0-9a-f]{40}$/i.test(value ?? "")) {
      // Caller supplied a malformed reference, not an external outage.
      throw classified(
        new Error("--current requires a 40-character commit SHA"),
        MAPS_CHECK_CLASSES.BROKEN_REFERENCE,
      );
    }
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
  if (!/^[0-9a-f]{40}$/i.test(sha ?? "")) {
    // git succeeded but returned nothing usable — we could not obtain evidence.
    throw classified(
      new Error("Could not resolve googlemaps/agent-skills main"),
      MAPS_CHECK_CLASSES.EXTERNAL_UNAVAILABLE,
    );
  }
  return sha.toLowerCase();
}

const mode = resolveCheckMode(process.env.MAPS_CHECK_MODE);

function finish(classifications) {
  const { line, exitCode } = reportCheckSummary(CHECK, mode, classifications);
  console.log(line);
  process.exit(exitCode);
}

try {
  const pinned = pinnedCommit();
  const current = await currentCommit(process.argv.slice(2));

  if (pinned === current) {
    console.log(`UP_TO_DATE pinned=${pinned}`);
    finish([MAPS_CHECK_CLASSES.OK]);
  }

  console.error(`DRIFT pinned=${pinned} current=${current}`);
  console.error("Review upstream changes manually; do not overwrite the MDE skill automatically.");
  finish([MAPS_CHECK_CLASSES.DRIFT]);
} catch (error) {
  const classification =
    (error && typeof error === "object" && "classification" in error && error.classification) ||
    classifyFetchError(error);
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  finish([classification]);
}
