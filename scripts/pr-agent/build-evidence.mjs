#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DOMAIN_ORDER = ["nextjs", "supabase", "mastra", "copilotkit", "maps", "stripe", "ci"];
const DOMAIN_PACKAGES = {
  nextjs: ["next"],
  supabase: ["@supabase/supabase-js", "@supabase/ssr"],
  mastra: ["@mastra/core", "@mastra/pg", "mastra"],
  copilotkit: ["@copilotkit/runtime", "@copilotkit/react-core", "@ag-ui/client", "@ag-ui/mastra"],
  maps: ["@googlemaps/places", "@vis.gl/react-google-maps", "@googlemaps/markerclusterer"],
  stripe: [],
  ci: [],
};

const DOMAIN_MATCHERS = {
  nextjs: (p) => /(^src\/app\/|next\.config\.|^src\/(proxy|middleware)\.)/i.test(p),
  supabase: (p) => /(^supabase\/|(^|\/)supabase([\/_.-]|$)|^src\/app\/auth\/|^src\/proxy\.ts$)/i.test(p),
  mastra: (p) => /(^|\/)mastra(\/|[-_.])|requestcontext/i.test(p),
  copilotkit: (p) => /copilotkit|ag-ui/i.test(p),
  maps: (p) => /(^|\/)(map|maps|places?|geocod|grounding)(\/|[-_.])/i.test(p),
  stripe: (p) => /stripe/i.test(p) || /checkout/i.test(p),
  ci: (p) => /^\.github\/workflows\//.test(p) || /^scripts\/(check|verify|smoke)-/i.test(p),
};

export function validateLockfile(lockfile, label = "lockfile") {
  if (lockfile?.lockfileVersion !== 3 || !lockfile.packages || typeof lockfile.packages !== "object") {
    throw new Error(`${label} must be npm package-lock v3 with a packages map`);
  }
}

export function resolvePackageVersion(lockfile, packageName) {
  return lockfile?.packages?.[`node_modules/${packageName}`]?.version ?? null;
}

export function detectDomains(files) {
  if (!Array.isArray(files)) throw new TypeError("changed files must be an array");
  const selected = new Set();
  const allFrameworks = files.includes("package.json") || files.includes("package-lock.json");

  for (const domain of DOMAIN_ORDER) {
    if (allFrameworks && DOMAIN_PACKAGES[domain].length) selected.add(domain);
  }
  for (const file of files) {
    for (const domain of DOMAIN_ORDER) {
      if (DOMAIN_MATCHERS[domain]?.(file)) selected.add(domain);
    }
  }
  return DOMAIN_ORDER.filter((domain) => selected.has(domain));
}
export function buildEvidence({ baseSha, headSha, changedFiles, baseLock, headLock }) {
  validateLockfile(baseLock, "base lockfile");
  validateLockfile(headLock, "head lockfile");
  const domains = detectDomains(changedFiles);
  const missing = [];
  const versionLines = [];

  for (const domain of domains) {
    const packages = DOMAIN_PACKAGES[domain];
    let resolved = 0;
    for (const packageName of packages) {
      const baseVersion = resolvePackageVersion(baseLock, packageName);
      const headVersion = resolvePackageVersion(headLock, packageName);
      if (!baseVersion && !headVersion) continue;
      resolved += 1;
      const before = baseVersion ?? "not present";
      const after = headVersion ?? "not present";
      versionLines.push(`- \`${packageName}\`: ${before} → ${after}`);
    }
    if (packages.length && resolved === 0) missing.push(domain);
  }

  const status = missing.length ? "NEEDS VERIFICATION" : "VERIFIED";
  const lines = [
    "# MDE PR-Agent Evidence",
    "",
    `Version evidence: **${status}**`,
    "API claim default: **NEEDS VERIFICATION**",
    "Exact version evidence alone does not prove a specific API claim. A claim becomes VERIFIED only when trusted diff/repository/skill/type evidence proves that behavior for the resolved version.",
    `Base SHA: \`${baseSha}\``,
    `Head SHA: \`${headSha}\``,
    `Touched domains: ${domains.length ? domains.join(", ") : "none"}`,
    "",
    "## Exact resolved package versions",
    ...(versionLines.length ? versionLines : ["- No version-sensitive framework packages detected."]),
  ];

  if (missing.length) {
    lines.push("", "## Missing exact version evidence");
    for (const item of missing) lines.push(`- ${item}`);
    lines.push("", "Framework/API findings without exact evidence must be NEEDS VERIFICATION and advisory only.");
  }

  return { status, domains, missing, markdown: `${lines.join("\n")}\n` };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument: ${key ?? "<missing>"}`);
    out[key.slice(2)] = value;
  }
  return out;
}
function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const required = ["base-lock", "head-lock", "base-sha", "head-sha", "changed-files", "output"];
  for (const key of required) {
    if (!args[key]) throw new Error(`missing --${key}`);
  }

  const baseLock = JSON.parse(readFileSync(args["base-lock"], "utf8"));
  const headLock = JSON.parse(readFileSync(args["head-lock"], "utf8"));
  const changedFiles = JSON.parse(args["changed-files"]);
  const result = buildEvidence({
    baseSha: args["base-sha"],
    headSha: args["head-sha"],
    changedFiles,
    baseLock,
    headLock,
  });

  writeFileSync(args.output, result.markdown, "utf8");
  process.stdout.write(`status=${result.status}\n`);
  process.stdout.write(`domains=${result.domains.join(",")}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
