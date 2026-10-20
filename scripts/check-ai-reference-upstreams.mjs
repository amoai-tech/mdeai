#!/usr/bin/env node
/**
 * SAN-1551: inspect three optional AI source references during the EXISTING
 * weekly skill-maintenance job. A newer HEAD is a review prompt, not an
 * instruction to install/update dependencies or block application releases.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  CLASSES,
  classifyError,
  fetchComparison,
} from "./check-skill-upstream-drift.mjs";

const STRATEGIES = new Set(["MODEL", "ADAPT", "REFERENCE ONLY"]);
const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const ISSUE = /^SAN-[1-9][0-9]*$/;

/** Validate the pinned inventory without touching the filesystem. */
export function parseReferenceUpstreams(config) {
  if (config.schemaVersion !== 1 || !Array.isArray(config.sources) || config.sources.length !== 3) {
    throw new Error("Expected exactly three tracked AI reference projects");
  }
  const seen = new Set();
  for (const entry of config.sources) {
    if (!["OpenMuse", "OpenDots", "OpenBot"].includes(entry.name) ||
        !REPO.test(entry.repository) || !SHA.test(entry.reviewedCommit) ||
        !STRATEGIES.has(entry.strategy) || !ISSUE.test(entry.linear) ||
        !Array.isArray(entry.destinations) || !entry.destinations.length ||
        entry.destinations.some((dest) => typeof dest !== "string" || !dest.startsWith("src/") && !dest.startsWith("docs/"))) {
      throw new Error("Invalid upstream reference entry: " + String(entry.name));
    }
    if (seen.has(entry.name)) throw new Error("Duplicate upstream reference: " + entry.name);
    seen.add(entry.name);
  }
  if (seen.size !== 3) throw new Error("Missing an AI upstream project");
  return config.sources;
}

/** Read the committed manifest from the repository root. */
export function loadReferenceUpstreams() {
  const config = JSON.parse(fs.readFileSync("docs/03-platform/copilotkit-mastra/reference-upstreams.json", "utf8"));
  return parseReferenceUpstreams(config);
}

export async function inspectReferences(entries, compare = fetchComparison) {
  const results = [];
  for (const entry of entries) {
    try {
      const upstream = await compare(entry.repository, entry.reviewedCommit);
      results.push({ ...entry, ...upstream });
    } catch (error) {
      results.push({ ...entry, classification: classifyError(error) });
    }
  }
  return results;
}

export function formatSummary(results) {
  return [
    "## AI reference upstreams (SAN-1551)",
    "",
    "Changes require review by the existing Linear owner. No automatic upgrades or PR gates.",
    "",
    "| Project | Reference | Status | Owner | Review |",
    "| --- | --- | --- | --- | --- |",
    ...results.map((entry) =>
      "| " + entry.name +
      " | `" + entry.reviewedCommit.slice(0, 9) + "`" +
      " | " + entry.classification +
      (entry.aheadBy ? " (" + entry.aheadBy + " ahead)" : "") +
      " | " + entry.linear +
      " | [Compare](https://github.com/" + entry.repository + "/compare/" +
      entry.reviewedCommit + "...HEAD) |"),
    "",
  ].join("\n");
}

async function main() {
  const entries = loadReferenceUpstreams();
  const result = await inspectReferences(entries);
  const summary = formatSummary(result);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result.map(({ name, repository, reviewedCommit, reviewedRelease, strategy, linear, classification, aheadBy }) =>
      ({ name, repository, reviewedCommit, reviewedRelease: reviewedRelease ?? null,
        strategy, linear, classification, aheadBy: aheadBy ?? null })), null, 2));
  } else console.log(summary);
  for (const entry of result) {
    if (entry.classification !== CLASSES.OK) {
      console.log("::warning::" + entry.name + " " + entry.classification +
        " against " + entry.reviewedCommit.slice(0, 9) + "; review " + entry.linear);
    }
  }
  // Reference drift is deliberately NOT a required release or business gate.
  // Malformed manifests and runtime exceptions still fail normally.
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
