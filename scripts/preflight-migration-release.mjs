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
 *
 * The decision logic is a pure function (`evaluatePreflight`) so it can be tested without a
 * repository, a network, or a git binary — see
 * scripts/__tests__/preflight-migration-release.test.mjs.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MIGRATIONS_DIR = "supabase/migrations";
export const EXPECTED_BRANCH = "main";

/**
 * Decide pass/fail from already-gathered git state. Pure: no I/O, no globals.
 *
 * @param {object} state
 * @param {string|null} state.fetchError       set when `git fetch origin` failed
 * @param {boolean} state.fetchSkipped         true when --no-fetch was passed
 * @param {boolean} state.allowTrackedDirty    true when --allow-tracked-dirty was passed
 * @param {string[]} state.trackedDirty        porcelain lines for modified tracked files
 * @param {boolean} state.migrationsDirExists  whether MIGRATIONS_DIR is present
 * @param {string[]} state.untrackedMigrations untracked .sql files under MIGRATIONS_DIR
 * @param {string[]} state.untrackedOther      untracked files elsewhere
 * @param {string|null} state.branch
 * @param {string|null} state.head
 * @param {string|null} state.originMain
 * @param {number|null} state.ahead            commits HEAD is ahead of origin/main
 * @param {number|null} state.behind           commits HEAD is behind origin/main
 * @param {string|null} state.revParseError    set when HEAD/origin-main could not be resolved
 * @returns {{checks: Array<{level: string, message: string, details?: string[]}>, failures: number, warnings: number}}
 */
export function evaluatePreflight(state) {
  const checks = [];
  const add = (level, message, details) => checks.push({ level, message, details });

  // ── 1 · Did the remote refresh succeed? ──────────────────────────────────────────────────
  if (state.fetchSkipped) {
    add("skip", "git fetch origin (--no-fetch)");
  } else if (state.fetchError) {
    // Not proof the tree is unsafe, but HEAD is compared against a possibly stale
    // origin/main, so the comparison below cannot be trusted.
    add("fail", `git fetch origin failed — HEAD vs origin/main cannot be trusted (${state.fetchError})`);
  } else {
    add("pass", "git fetch origin --prune");
  }

  // ── 2 · No modified TRACKED files ────────────────────────────────────────────────────────
  if (state.trackedDirty.length === 0) {
    add("pass", "no modified tracked files");
  } else if (state.allowTrackedDirty) {
    add(
      "warn",
      `modified tracked files present but --allow-tracked-dirty was passed (${state.trackedDirty.length})`,
    );
  } else {
    add(
      "fail",
      `modified tracked files present (${state.trackedDirty.length}) — commit or stash before a release`,
      state.trackedDirty.slice(0, 10),
    );
  }

  // ── 3 · Untracked migrations would still be pushed ───────────────────────────────────────
  if (!state.migrationsDirExists) {
    add("warn", `${MIGRATIONS_DIR} does not exist — nothing to push`);
  } else if (state.untrackedMigrations.length === 0) {
    add("pass", `no untracked .sql files in ${MIGRATIONS_DIR}`);
  } else {
    add(
      "fail",
      `${state.untrackedMigrations.length} untracked migration(s) would be pushed but are not in Git`,
      state.untrackedMigrations,
    );
  }

  // Untracked files elsewhere cannot reach production, but they mean a noisy tree.
  if (state.untrackedOther.length > 0) {
    add(
      "warn",
      `${state.untrackedOther.length} untracked file(s) outside ${MIGRATIONS_DIR} — cannot affect a push`,
    );
  }

  // ── 4 · On the release branch ────────────────────────────────────────────────────────────
  if (state.branch === EXPECTED_BRANCH) {
    add("pass", `current branch is ${EXPECTED_BRANCH}`);
  } else if (state.branch === null) {
    add("fail", `cannot determine the current branch — refusing to assume ${EXPECTED_BRANCH}`);
  } else {
    // The exact failure mode that nearly leaked SAN-1313: a feature branch carries
    // migrations that are not on main and not yet reviewed for production.
    add(
      "fail",
      `current branch is "${state.branch}", expected "${EXPECTED_BRANCH}" — a feature branch may carry unreleased migrations`,
    );
  }

  // ── 5 · HEAD is exactly origin/main ──────────────────────────────────────────────────────
  if (state.revParseError || !state.head || !state.originMain) {
    add(
      "fail",
      `cannot resolve HEAD or origin/${EXPECTED_BRANCH}${state.revParseError ? ` (${state.revParseError})` : ""}`,
    );
  } else if (state.head === state.originMain) {
    add("pass", `HEAD == origin/${EXPECTED_BRANCH} (${state.head.slice(0, 9)})`);
  } else {
    // Report the real direction. A branch that is merely BEHIND would otherwise render as
    // "0 commit(s) ahead", which reads as "in sync" and is actively misleading.
    const ahead = state.ahead ?? 0;
    const behind = state.behind ?? 0;
    const direction =
      ahead > 0 && behind > 0
        ? `${ahead} ahead and ${behind} behind`
        : ahead > 0
          ? `${ahead} commit(s) ahead of`
          : behind > 0
            ? `${behind} commit(s) behind`
            : "out of sync with";
    add(
      "fail",
      `HEAD (${state.head.slice(0, 9)}) is ${direction} origin/${EXPECTED_BRANCH} (${state.originMain.slice(0, 9)}) — a release must ship exactly what is on the remote`,
    );
  }

  const failures = checks.filter((c) => c.level === "fail").length;
  const warnings = checks.filter((c) => c.level === "warn").length;
  return { checks, failures, warnings };
}

// ── I/O layer ──────────────────────────────────────────────────────────────────────────────

/** Never throws: git may be absent, or cwd may not be a repository. */
function tryGit(...cmdArgs) {
  try {
    return {
      ok: true,
      value: execFileSync("git", cmdArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
    };
  } catch (err) {
    const first = String(err?.message ?? err).split("\n")[0];
    return { ok: false, error: first };
  }
}

function lines(result) {
  return result.ok ? result.value.split("\n").filter(Boolean) : [];
}

function count(result) {
  if (!result.ok) return null;
  const n = Number.parseInt(result.value, 10);
  return Number.isFinite(n) ? n : null;
}

export function gatherState(argv = new Set()) {
  const skipFetch = argv.has("--no-fetch");
  const allowTrackedDirty = argv.has("--allow-tracked-dirty");

  let fetchError = null;
  if (!skipFetch) {
    const fetched = tryGit("fetch", "origin", "--prune");
    if (!fetched.ok) fetchError = fetched.error;
  }

  const headResult = tryGit("rev-parse", "HEAD");
  const originMainResult = tryGit("rev-parse", `origin/${EXPECTED_BRANCH}`);
  const branchResult = tryGit("rev-parse", "--abbrev-ref", "HEAD");

  let revParseError = null;
  if (!headResult.ok) revParseError = headResult.error;
  else if (!originMainResult.ok) revParseError = originMainResult.error;

  return {
    fetchError,
    fetchSkipped: skipFetch,
    allowTrackedDirty,
    trackedDirty: lines(tryGit("status", "--porcelain", "--untracked-files=no")),
    migrationsDirExists: existsSync(MIGRATIONS_DIR),
    untrackedMigrations: lines(tryGit("ls-files", "--others", "--exclude-standard", MIGRATIONS_DIR)).filter(
      (f) => f.endsWith(".sql"),
    ),
    untrackedOther: lines(tryGit("ls-files", "--others", "--exclude-standard")).filter(
      (f) => f && !f.startsWith(`${MIGRATIONS_DIR}/`),
    ),
    branch: branchResult.ok ? branchResult.value : null,
    head: headResult.ok ? headResult.value : null,
    originMain: originMainResult.ok ? originMainResult.value : null,
    ahead: count(tryGit("rev-list", "--count", `origin/${EXPECTED_BRANCH}..HEAD`)),
    behind: count(tryGit("rev-list", "--count", `HEAD..origin/${EXPECTED_BRANCH}`)),
    revParseError,
  };
}

function main() {
  const state = gatherState(new Set(process.argv.slice(2)));
  const { checks, failures, warnings } = evaluatePreflight(state);

  console.log("preflight-migration-release\n");
  for (const check of checks) {
    console.log(`  ${check.level.toUpperCase().padEnd(4)}  ${check.message}`);
    for (const detail of check.details ?? []) console.log(`          ${detail}`);
  }

  console.log("\n  The remaining steps need a database connection and are NOT automated here:\n");
  console.log('    supabase migration list  --db-url "$SUPABASE_DB_URL"');
  console.log('    supabase db push --dry-run --db-url "$SUPABASE_DB_URL"\n');
  console.log("  The dry-run list IS the deployment manifest. Read every line.");
  console.log("  If it contains anything outside the approved task, STOP.\n");

  if (warnings > 0) {
    console.log(`  ${warnings} warning(s) — review above, none block a release.\n`);
  }

  if (failures > 0) {
    console.log(`preflight-migration-release: FAIL (${failures} blocking check(s))`);
    process.exit(1);
  }
  console.log("preflight-migration-release: PASS — safe to run the ledger and dry-run steps");
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
