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
  // MDE currently integrates payment/checkout flows without a direct Stripe SDK package.
  // Keep the domain reviewable, but do not require nonexistent package-version evidence.
  stripe: [],
  ci: [],
};

const DOMAIN_MATCHERS = {
  nextjs: (p) => /(^src\/app\/|next\.config\.|^src\/(proxy|middleware)\.)/i.test(p),
  // src/proxy.ts delegates MDE's request/session boundary to the Supabase auth middleware.
  supabase: (p) => /(^supabase\/|(^|\/)supabase([\/_.-]|$)|^src\/app\/auth\/|^src\/proxy\.ts$)/i.test(p),
  mastra: (p) => /(^|\/)mastra(\/|[-_.])|requestcontext/i.test(p),
  copilotkit: (p) => /copilotkit|ag-ui/i.test(p),
  maps: (p) => /(^|\/)(map|maps|places?|geocod|grounding)(\/|[-_.])/i.test(p),
  stripe: (p) => /stripe/i.test(p) || /checkout/i.test(p),
  ci: (p) => /^\.github\/workflows\//.test(p) || /^scripts\/(check|verify|smoke)-/i.test(p),
};

export function validateLockfile(lockfile, label = "lockfile") {
  // MDE's committed package manager contract is npm package-lock v3. Unsupported
  // formats intentionally fall back to advisory evidence in the workflow.
  if (lockfile?.lockfileVersion !== 3 || !lockfile.packages || typeof lockfile.packages !== "object") {
    throw new Error(`${label} must be npm package-lock v3 with a packages map`);
  }
}

const SAFE_VERSION = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;

function readPackageVersion(lockfile, packageName) {
  const raw = lockfile?.packages?.[`node_modules/${packageName}`]?.version;
  if (raw == null) return { version: null, unsafe: false };
  if (typeof raw !== "string" || !SAFE_VERSION.test(raw)) return { version: null, unsafe: true };
  return { version: raw, unsafe: false };
}

export function resolvePackageVersion(lockfile, packageName) {
  return readPackageVersion(lockfile, packageName).version;
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
  const unsafe = [];
  const versionLines = [];
  const versionSensitiveDomains = domains.filter((domain) => DOMAIN_PACKAGES[domain].length > 0);

  for (const domain of domains) {
    const packages = DOMAIN_PACKAGES[domain];
    let resolved = 0;
    for (const packageName of packages) {
      const base = readPackageVersion(baseLock, packageName);
      const head = readPackageVersion(headLock, packageName);
      if (base.unsafe || head.unsafe) {
        unsafe.push(`${domain}:${packageName}`);
        continue;
      }
      if (!base.version && !head.version) continue;
      resolved += 1;
      const before = base.version ?? "not present";
      const after = head.version ?? "not present";
      versionLines.push(`- \`${packageName}\`: ${before} → ${after}`);
    }
    if (packages.length && resolved === 0) missing.push(domain);
  }

  const noVersionContract = domains.length > 0 && versionSensitiveDomains.length === 0;
  const status = missing.length || unsafe.length || noVersionContract ? "NEEDS VERIFICATION" : "VERIFIED";
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

  if (noVersionContract) {
    lines.push("", "No version-sensitive package contract for touched domains; version evidence remains NEEDS VERIFICATION.");
  }

  if (unsafe.length) {
    lines.push("", "## Unsafe exact version metadata");
    for (const item of unsafe) lines.push(`- ${item}`);
    lines.push("", "Unsafe PR-controlled version metadata is never injected into trusted reviewer context.");
  }

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
