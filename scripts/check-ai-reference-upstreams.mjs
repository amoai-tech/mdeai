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

const EXPECTED_REPOSITORIES = Object.freeze({
  OpenMuse: "CopilotKit/openmuse",
  OpenDots: "CopilotKit/OpenDots",
  OpenBot: "CopilotKit/openbot",
});
const CLASS_VALUES = new Set(Object.values(CLASSES));
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
    if (!Object.hasOwn(EXPECTED_REPOSITORIES, entry.name) ||
        !REPO.test(entry.repository) || !SHA.test(entry.reviewedCommit) ||
        !STRATEGIES.has(entry.strategy) || !ISSUE.test(entry.linear) ||
        !Array.isArray(entry.destinations) || !entry.destinations.length ||
        entry.destinations.some((dest) => typeof dest !== "string" || !dest.startsWith("src/") && !dest.startsWith("docs/"))) {
      throw new Error("Invalid upstream reference entry: " + String(entry.name));
    }
    if (EXPECTED_REPOSITORIES[entry.name] !== entry.repository) {
      throw new Error("Unexpected repository for " + entry.name + ": " + entry.repository);
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

export function upstreamSourceUrl(entry) {
  return "https://github.com/" + entry.repository + "/compare/" + entry.reviewedCommit + "...HEAD";
}

function safeErrorReason(error) {
  const code = error?.cause?.code ?? error?.code;
  if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
  if (typeof error?.name === "string" && /^[A-Za-z0-9_.-]+$/.test(error.name)) return error.name;
  return "UNKNOWN";
}

export async function inspectReferences(entries, compare = fetchComparison) {
  const results = [];
  for (const entry of entries) {
    const sourceUrl = upstreamSourceUrl(entry);
    try {
      const upstream = await compare(entry.repository, entry.reviewedCommit);
      const classification = CLASS_VALUES.has(upstream?.classification)
        ? upstream.classification
        : CLASSES.DRIFT;
      results.push({ ...entry, ...upstream, classification, sourceUrl });
    } catch (error) {
      results.push({
        ...entry,
        classification: classifyError(error),
        reason: safeErrorReason(error),
        sourceUrl,
      });
    }
  }
  return results;
}

export function formatSummary(results) {
  return [
    "## AI reference upstreams (SAN-1551)",
    "",
    "Each row needs a manual decision: adapt, defer, or ignore. No automatic upgrades or PR gates.",
    "",
    "| Project | Reference | Status | Owner | Review |",
    "| --- | --- | --- | --- | --- |",
    ...results.map((entry) => {
      const status = entry.classification + (entry.reason ? " (" + entry.reason + ")" : "");
      const release = entry.reviewedRelease
        ? "[release](https://github.com/" + entry.repository + "/releases/tag/" + encodeURIComponent(entry.reviewedRelease) + ")"
        : null;
      const review = [release, "[compare](" + (entry.sourceUrl ?? upstreamSourceUrl(entry)) + ")"].filter(Boolean).join(" · ");
      return "| " + entry.name +
        " | `" + entry.reviewedCommit.slice(0, 9) + "`" +
        " | " + status +
        (entry.aheadBy ? " (" + entry.aheadBy + " ahead)" : "") +
        " | " + entry.linear +
        " | " + review + " |";
    }),
    "",
  ].join("\n");
}

export function formatJson(results) {
  return JSON.stringify(resultJson(results), null, 2);
}

function resultJson(results) {
  return results.map(({ name, repository, reviewedCommit, reviewedRelease, strategy, linear, classification, aheadBy, reason, sourceUrl }) => ({
    name,
    repository,
    reviewedCommit,
    reviewedRelease: reviewedRelease ?? null,
    strategy,
    linear,
    classification,
    aheadBy: aheadBy ?? null,
    reason: reason ?? null,
    sourceUrl,
  }));
}

export function formatWarning(entry) {
  return "::warning::" + entry.name + " " + entry.classification +
    (entry.reason ? " (" + entry.reason + ")" : "") +
    " against " + entry.reviewedCommit.slice(0, 9) + "; review " + entry.linear +
    " at " + entry.sourceUrl;
}

async function main() {
  try {
    const entries = loadReferenceUpstreams();
    const result = await inspectReferences(entries);
    const jsonOut = process.argv.includes("--json");
    if (jsonOut) console.log(formatJson(result));
    else console.log(formatSummary(result));
    for (const entry of result) {
      if (entry.classification !== CLASSES.OK) {
        // Keep stdout valid JSON; annotations belong on stderr in JSON mode.
        if (jsonOut) console.error(formatWarning(entry));
        else console.log(formatWarning(entry));
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
  // Reference drift is deliberately NOT a required release or business gate.
  // Malformed manifests and runtime exceptions still fail normally.
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
