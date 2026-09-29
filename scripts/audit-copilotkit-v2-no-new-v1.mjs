#!/usr/bin/env node
/**
 * CK-V2-012 · SAN-910 · Migration CI guardrails (audit dashboard + no-new-v1 gate) —
 * fail new v1 CopilotKit hook/import usage outside allowlist.
 * Exempt: copilotkit-v2-allowlist.json · *-v1.tsx rollback twins · __tests__ · e2e/
 *
 * The allowlist is a migration ledger, not a permanent exemption. Every entry must still hide a
 * real v1 usage; a stale entry is itself a failure, because it pre-approves whatever is written at
 * that path next.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { stripComments } from "./lib/strip-comments.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const ALLOWLIST_PATH = join(ROOT, "scripts/copilotkit-v2-allowlist.json");

const FORBIDDEN = [
  { id: "useCoAgent", re: /\buseCoAgent\b/ },
  { id: "useCopilotAction", re: /\buseCopilotAction\b/ },
  { id: "renderAndWaitForResponse", re: /\brenderAndWaitForResponse\b/ },
  { id: "@copilotkit/react-ui", re: /@copilotkit\/react-ui/ },
  { id: "@copilotkit/react-core-v1", re: /@copilotkit\/react-core(?!\/v2)/ },
];

/** v1 hits in code, ignoring comment prose. */
function v1Hits(text) {
  const code = stripComments(text);
  return FORBIDDEN.filter(({ re }) => re.test(code)).map((f) => f.id);
}

function isExemptPath(rel) {
  if (rel.includes("/__tests__/")) return true;
  if (/\.(test|spec)\.[jt]sx?$/.test(rel)) return true;
  if (/-v1\.tsx$/.test(rel)) return true;
  return false;
}

async function walk(dir, acc = []) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      await walk(p, acc);
    } else if (/\.(tsx?|jsx?)$/.test(ent.name)) {
      acc.push(p);
    }
  }
  return acc;
}

async function loadAllowlist() {
  const raw = await readFile(ALLOWLIST_PATH, "utf8");
  const data = JSON.parse(raw);
  return new Set(data.files);
}

async function scanForAllowlist() {
  const files = await walk(SRC);
  const offenders = [];
  for (const abs of files) {
    const rel = relative(ROOT, abs).replace(/\\/g, "/");
    if (isExemptPath(rel)) continue;
    const text = await readFile(abs, "utf8");
    const hits = v1Hits(text);
    if (hits.length) offenders.push(rel);
  }
  return offenders.sort();
}

async function writeAllowlistFromDisk() {
  const offenders = await scanForAllowlist();
  const payload = {
    description:
      "CK-V2-012 · SAN-910 · Migration CI guardrails (audit dashboard + no-new-v1 gate) — files still using v1 CopilotKit hooks/imports. A migration ledger, not a permanent exemption: the guard fails when an entry no longer hides a real v1 usage. Regenerate via: node scripts/audit-copilotkit-v2-no-new-v1.mjs --write-allowlist",
    // No mainSha: it was a hand-copied literal that had already gone stale (`fbcf8d3`), the same
    // class of bug as the version literals removed in SAN-1357 Step 5. Git records provenance.
    files: offenders,
  };
  await writeFile(ALLOWLIST_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${offenders.length} paths to ${relative(ROOT, ALLOWLIST_PATH)}`);
}

/**
 * An allowlist entry earns its exemption only while the file it names still contains a v1 pattern.
 * Without this check the ledger rots silently: all 29 entries had gone stale — none still contained
 * a v1 pattern and 8 named files that no longer exist — so appending a bare v1 import to an
 * already-listed provider file produced `OK — 29 allowlisted` and exit 0.
 */
async function findStaleAllowances(allowlist) {
  const stale = [];
  for (const rel of allowlist) {
    let text;
    try {
      text = await readFile(join(ROOT, rel), "utf8");
    } catch {
      stale.push({ file: rel, reason: "the file no longer exists" });
      continue;
    }
    const hits = v1Hits(text);
    if (!hits.length) stale.push({ file: rel, reason: "no v1 pattern remains" });
  }
  return stale.sort((a, b) => a.file.localeCompare(b.file));
}

async function audit(extraPaths = []) {
  const allowlist = await loadAllowlist();
  const stale = await findStaleAllowances(allowlist);

  if (stale.length) {
    console.error("# CK-V2 allowlist entries that no longer earn their exemption\n");
    for (const { file, reason } of stale) {
      console.error(`- ${file}: ${reason}`);
    }
    console.error(
      `\n${stale.length} entr${stale.length === 1 ? "y" : "ies"} in scripts/copilotkit-v2-allowlist.json ` +
        `no longer hide a real v1 usage. An exemption that outlives its usage silently pre-approves ` +
        `whatever is written at that path next. Remove ${stale.length === 1 ? "it" : "them"}:\n` +
        `  node scripts/audit-copilotkit-v2-no-new-v1.mjs --write-allowlist`,
    );
    process.exit(1);
  }

  const files = [...(await walk(SRC)), ...extraPaths.map((p) => join(ROOT, p))];
  const violations = [];

  for (const abs of files) {
    const rel = relative(ROOT, abs).replace(/\\/g, "/");
    if (!rel.startsWith("src/") && !extraPaths.includes(rel)) continue;
    if (isExemptPath(rel)) continue;
    if (allowlist.has(rel)) continue;

    const text = await readFile(abs, "utf8");
    const hits = v1Hits(text);
    if (hits.length) violations.push({ file: rel, hits });
  }

  if (violations.length) {
    console.error("# CK-V2 no-new-v1 violations\n");
    for (const v of violations) {
      console.error(`- ${v.file}: ${v.hits.join(", ")}`);
    }
    console.error(
      `\n${violations.length} file(s) use v1 CopilotKit outside the allowlist. Add to scripts/copilotkit-v2-allowlist.json only when migrating an existing file — never for net-new v1 debt.`,
    );
    process.exit(1);
  }

  console.log(
    `CK-V2 no-new-v1: OK — ${allowlist.size} allowlisted · exempt *-v1.tsx + __tests__`,
  );
}

if (process.argv.includes("--write-allowlist")) {
  await writeAllowlistFromDisk();
} else {
  const extra = process.argv
    .filter((a) => a.startsWith("--file="))
    .map((a) => a.slice("--file=".length));
  await audit(extra);
}
