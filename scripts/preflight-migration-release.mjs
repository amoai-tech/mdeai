#!/usr/bin/env node
/**
 * Pre-production migration preflight.
 *
 * WHY THIS EXISTS
 * A production `supabase db push` is decided by three things, not one:
 *
 *   the migrations you intend to deploy
 * + whatever else is in supabase/migrations/ right now
 * + what the current branch and HEAD happen to be
 *
 * On 2026-09-28 that combination nearly pushed two unreviewed SAN-1313 migrations to
 * production while the operator believed they were applying only SAN-1283. The dry-run
 * would have shown it, but only if someone read the list and recognised the extras.
 *
 * This script automates the part that needs no production access: the Git state. It cannot
 * check the ledger or the dry-run — those need a database connection and belong to the
 * operator — so it prints those as the exact next commands.
 *
 * THE HAZARD THIS CATCHES THAT A CLEAN-TREE CHECK MISSES
 * `supabase db push` reads the working directory, not Git. An UNTRACKED .sql file under
 * supabase/migrations/ is therefore pushed just like a committed one, while `git status`
 * looks merely "noisy". Untracked files elsewhere in the repo cannot affect a push, so they
 * are reported as a warning rather than a failure.
 *
 * Usage:
 *   node scripts/preflight-migration-release.mjs [--no-fetch] [--allow-tracked-dirty]
 *
 * Exit 0 = safe to proceed to the ledger/dry-run steps. Exit 1 = stop.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const SKIP_FETCH = args.has("--no-fetch");
const ALLOW_DIRTY_TRACKED = args.has("--allow-tracked-dirty");

const MIGRATIONS_DIR = "supabase/migrations";
const EXPECTED_BRANCH = "main";

const failures = [];
const warnings = [];

function run(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function git(...cmdArgs) {
  return run("git", cmdArgs);
}

function pass(msg) {
  console.log(`  PASS  ${msg}`);
}
function fail(msg) {
  failures.push(msg);
  console.log(`  FAIL  ${msg}`);
}
function warn(msg) {
  warnings.push(msg);
  console.log(`  WARN  ${msg}`);
}

console.log("preflight-migration-release\n");

// ── 1 · Refresh the remote so HEAD is compared against reality, not a stale cache ──────────
if (SKIP_FETCH) {
  console.log("  SKIP  git fetch origin (--no-fetch)");
} else {
  try {
    git("fetch", "origin", "--prune");
    pass("git fetch origin --prune");
  } catch (err) {
    // A fetch failure is not proof the tree is unsafe, but HEAD is measured against a
    // possibly stale origin/main, so the comparison below cannot be trusted.
    fail(`git fetch origin failed — HEAD vs origin/main cannot be trusted (${String(err.message).split("\n")[0]})`);
  }
}

// ── 2 · No modified TRACKED files ─────────────────────────────────────────────────────────
// Untracked files are handled separately: only those under the migrations directory matter.
const trackedDirty = git("status", "--porcelain", "--untracked-files=no")
  .split("\n")
  .filter(Boolean);

if (trackedDirty.length === 0) {
  pass("no modified tracked files");
} else if (ALLOW_DIRTY_TRACKED) {
  warn(`modified tracked files present but --allow-tracked-dirty was passed (${trackedDirty.length})`);
} else {
  fail(`modified tracked files present (${trackedDirty.length}) — commit or stash before a release`);
  for (const line of trackedDirty.slice(0, 10)) console.log(`          ${line}`);
}

// ── 3 · Untracked migrations would still be pushed ────────────────────────────────────────
if (!existsSync(MIGRATIONS_DIR)) {
  warn(`${MIGRATIONS_DIR} does not exist — nothing to push`);
} else {
  const untrackedMigrations = git("ls-files", "--others", "--exclude-standard", MIGRATIONS_DIR)
    .split("\n")
    .filter((f) => f.endsWith(".sql"));

  if (untrackedMigrations.length === 0) {
    pass(`no untracked .sql files in ${MIGRATIONS_DIR}`);
  } else {
    fail(
      `${untrackedMigrations.length} untracked migration(s) would be pushed but are not in Git:`,
    );
    for (const f of untrackedMigrations) console.log(`          ${f}`);
  }

  // Untracked files elsewhere cannot reach production, but they mean a noisy tree.
  const untrackedOther = git("ls-files", "--others", "--exclude-standard")
    .split("\n")
    .filter((f) => f && !f.startsWith(`${MIGRATIONS_DIR}/`));
  if (untrackedOther.length > 0) {
    warn(`${untrackedOther.length} untracked file(s) outside ${MIGRATIONS_DIR} — cannot affect a push`);
  }
}

// ── 4 · On the release branch ─────────────────────────────────────────────────────────────
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch === EXPECTED_BRANCH) {
  pass(`current branch is ${EXPECTED_BRANCH}`);
} else {
  // This is the exact failure mode that nearly leaked SAN-1313: a feature branch carries
  // migrations that are not on main and not yet reviewed for production.
  fail(`current branch is "${branch}", expected "${EXPECTED_BRANCH}" — a feature branch may carry unreleased migrations`);
}

// ── 5 · HEAD is exactly origin/main ───────────────────────────────────────────────────────
let head = "";
let originMain = "";
try {
  head = git("rev-parse", "HEAD");
  originMain = git("rev-parse", `origin/${EXPECTED_BRANCH}`);
} catch {
  fail(`cannot resolve HEAD or origin/${EXPECTED_BRANCH}`);
}

if (head && originMain) {
  if (head === originMain) {
    pass(`HEAD == origin/${EXPECTED_BRANCH} (${head.slice(0, 9)})`);
  } else {
    const ahead = (() => {
      try {
        return git("rev-list", "--count", `origin/${EXPECTED_BRANCH}..HEAD`);
      } catch {
        return "?";
      }
    })();
    fail(
      `HEAD (${head.slice(0, 9)}) != origin/${EXPECTED_BRANCH} (${originMain.slice(0, 9)}) — ${ahead} commit(s) ahead; a release must ship what is on the remote`,
    );
  }
}

// ── 6 · Hand the operator the steps that need production access ───────────────────────────
console.log("\n  The remaining steps need a database connection and are NOT automated here:\n");
console.log("    supabase migration list  --db-url \"$SUPABASE_DB_URL\"");
console.log("    supabase db push --dry-run --db-url \"$SUPABASE_DB_URL\"\n");
console.log("  The dry-run list IS the deployment manifest. Read every line.");
console.log("  If it contains anything outside the approved task, STOP.\n");

if (warnings.length > 0) {
  console.log(`  ${warnings.length} warning(s) — review above, none block a release.\n`);
}

if (failures.length > 0) {
  console.log(`preflight-migration-release: FAIL (${failures.length} blocking check(s))`);
  process.exit(1);
}

console.log("preflight-migration-release: PASS — safe to run the ledger and dry-run steps");
