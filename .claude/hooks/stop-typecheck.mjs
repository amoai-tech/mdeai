#!/usr/bin/env node
// Stop hook. Type-checks the project once per set of TypeScript edits, instead of after every edit.
//
// A whole-project `tsc` is the right size for the end of a turn, not for every edit. It runs only
// when .ts/.tsx files under src/ or supabase/functions/ changed AND those exact edits (file
// contents included, so new untracked files count) have not already been checked. It reports only
// errors in the changed files, so old unrelated errors never block a turn.
//
// Blocks the stop once (exit 2) so the errors reach the model; a second stop passes
// (`stop_hook_active`). It never passes silently: when it cannot run (no repo, no tsc, timeout) it
// blocks once too, saying why. Bypass: MDEAI_SKIP_STOP_TYPECHECK=1.

import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot } from "./lib/repo-path.mjs";

const TIMEOUT_MS = Number(process.env.MDEAI_STOP_TYPECHECK_TIMEOUT_MS) || 90_000;
const MARKER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}
if (payload?.stop_hook_active || process.env.MDEAI_SKIP_STOP_TYPECHECK === "1") process.exit(0);

/**
 * The check could not run. That must not look like a pass: block the stop once with the reason
 * and the escape hatch (a second stop passes through `stop_hook_active`).
 */
function couldNotRun(reason) {
  process.stderr.write(
    `stop-typecheck: ${reason}; TypeScript was NOT checked.\n` +
      `Fix that and stop again, or skip this check on purpose with MDEAI_SKIP_STOP_TYPECHECK=1.\n`,
  );
  process.exit(2);
}

const root = projectRoot();
if (!root) couldNotRun("could not locate the repository root");

function git(args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 10_000 });
  return r.status === 0 ? r.stdout : "";
}

const changed = git(["status", "--porcelain", "-uall"])
  .split("\n")
  .map((line) => line.slice(3).trim().replace(/^.* -> /, ""))
  .filter((f) => /^(src|supabase\/functions)\/.*\.(ts|tsx)$/.test(f))
  .sort();
if (changed.length === 0) process.exit(0);

const tsc = join(root, "node_modules/.bin/tsc");
if (!existsSync(tsc) || !existsSync(join(root, "tsconfig.json"))) couldNotRun("dependencies are not installed here (run scripts/worktree-bootstrap.sh)");

// Fingerprint the edits by file CONTENT. `git diff` is empty for untracked files, so a new file
// edited again would otherwise look unchanged and skip the check.
const hash = createHash("sha256").update(root);
for (const f of changed) {
  hash.update(f).update("\0");
  try {
    hash.update(readFileSync(join(root, f)));
  } catch {
    hash.update("<deleted>");
  }
}
const markerDir = join(tmpdir(), "mdeai-stop-typecheck");
mkdirSync(markerDir, { recursive: true });
const marker = join(markerDir, hash.digest("hex").slice(0, 24));
if (existsSync(marker)) process.exit(0);

// Drop old markers so the folder cannot grow forever.
for (const name of readdirSync(markerDir)) {
  const path = join(markerDir, name);
  try {
    if (Date.now() - statSync(path).mtimeMs > MARKER_TTL_MS) unlinkSync(path);
  } catch {
    /* another run removed it */
  }
}

const result = spawnSync(tsc, ["--noEmit", "--pretty", "false"], {
  cwd: root,
  encoding: "utf8",
  timeout: TIMEOUT_MS,
});
if (result.error || result.status === null) {
  // Timed out or could not start: do not record it as checked, and do not pretend it passed.
  couldNotRun(`tsc did not finish within ${Math.round(TIMEOUT_MS / 1000)}s`);
}
writeFileSync(marker, String(Date.now()));
if (result.status === 0) process.exit(0);

const lines = `${result.stdout || ""}${result.stderr || ""}`.split("\n").filter(Boolean);
const relevant = lines.filter((l) => changed.some((f) => l.startsWith(f)));
if (relevant.length === 0) process.exit(0); // errors exist, but none in files changed this session

process.stderr.write(
  `stop-typecheck: ${relevant.length} TypeScript error(s) in files changed this session:\n` +
    relevant.slice(0, 25).map((l) => `  ${l}`).join("\n") +
    `\nFix them or say why they are acceptable. To skip: MDEAI_SKIP_STOP_TYPECHECK=1.\n`,
);
process.exit(2);
