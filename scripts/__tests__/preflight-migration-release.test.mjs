/**
 * Tests for the pre-production migration preflight.
 *
 * `evaluatePreflight` is pure — it takes already-gathered git state and returns pass/fail — so
 * these tests need no repository, no network, and no git binary. That separation is the point:
 * the safety guard is the decision logic, and the decision logic is what is tested here.
 *
 * Runs via `npm run check:release-gates` (node --test scripts/__tests__/*.test.mjs).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluatePreflight,
  listPushableMigrations,
  EXPECTED_BRANCH,
  MIGRATIONS_DIR,
} from "../preflight-migration-release.mjs";

/** A state that passes every check, so each test can vary exactly one field. */
function cleanState(overrides = {}) {
  return {
    fetchError: null,
    fetchSkipped: true,
    allowTrackedDirty: false,
    trackedDirty: [],
    migrationsDirExists: true,
    pushableMigrations: [],
    trackedMigrations: [],
    ignoredMigrations: [],
    untrackedOther: [],
    branch: EXPECTED_BRANCH,
    head: "a".repeat(40),
    originMain: "a".repeat(40),
    ahead: 0,
    behind: 0,
    revParseError: null,
    ...overrides,
  };
}

const messages = (result) => result.checks.map((c) => c.message).join("\n");
const failureMessages = (result) =>
  result.checks.filter((c) => c.level === "fail").map((c) => c.message);

describe("preflight-migration-release", () => {
  describe("the happy path", () => {
    it("passes on a clean main at origin/main", () => {
      const result = evaluatePreflight(cleanState());
      assert.equal(result.failures, 0, messages(result));
    });

    it("treats a clean tree and matching HEAD as passes, not warnings", () => {
      const result = evaluatePreflight(cleanState({ fetchSkipped: false }));
      assert.equal(result.failures, 0);
      assert.equal(result.warnings, 0);
      assert.match(messages(result), /no modified tracked files/);
      assert.match(messages(result), /HEAD == origin\/main/);
    });
  });

  describe("the branch check — the SAN-1313 near-miss", () => {
    it("fails on a feature branch even when the tree is otherwise clean", () => {
      const result = evaluatePreflight(
        cleanState({ branch: "ai/san1313b-canonical-cron-schedules" }),
      );
      assert.equal(result.failures, 1);
      assert.match(messages(result), /expected "main"/);
      assert.match(messages(result), /feature branch may carry unreleased migrations/);
    });

    it("fails when the branch cannot be determined rather than assuming main", () => {
      const result = evaluatePreflight(cleanState({ branch: null }));
      assert.equal(result.failures, 1);
      assert.match(messages(result), /cannot determine the current branch/);
    });
  });

  describe("migrations the CLI would apply but Git does not track", () => {
    const PUSHED = "20260928150000_probe.sql";

    it("fails and names a migration that would be pushed but is not in Git", () => {
      const result = evaluatePreflight(cleanState({ pushableMigrations: [PUSHED] }));
      assert.equal(result.failures, 1);
      assert.match(failureMessages(result).join("\n"), /would be pushed but are not in Git/);
      assert.deepEqual(result.checks.find((c) => c.level === "fail").details, [
        `${MIGRATIONS_DIR}/${PUSHED}`,
      ]);
    });

    // The regression this change exists for. `git ls-files --others --exclude-standard` hides a
    // gitignored migration, but `supabase db push` reads the directory and applies it — so the
    // old check reported PASS while production would have received an unreviewed migration.
    // Confirmed against a live `db push --dry-run`, which pushed exactly this file.
    it("fails on a gitignored migration, and says .gitignore does not protect it", () => {
      const result = evaluatePreflight(
        cleanState({ pushableMigrations: [PUSHED], ignoredMigrations: [PUSHED] }),
      );
      assert.equal(result.failures, 1);
      const details = result.checks.find((c) => c.level === "fail").details.join("\n");
      assert.match(details, /gitignored/);
      assert.match(details, /\.gitignore does not protect it/);
    });

    it("passes when every migration the CLI would apply is tracked in Git", () => {
      const result = evaluatePreflight(
        cleanState({ pushableMigrations: [PUSHED], trackedMigrations: [PUSHED] }),
      );
      assert.equal(result.failures, 0, messages(result));
      assert.match(messages(result), /tracked in Git/);
    });

    it("fails closed when git cannot say which migrations are tracked", () => {
      const result = evaluatePreflight(
        cleanState({ pushableMigrations: [PUSHED], trackedMigrations: null }),
      );
      assert.equal(result.failures, 1);
      assert.match(messages(result), /cannot determine which migrations Git tracks/);
    });

    it("fails closed when the migrations directory is present but unreadable", () => {
      // [] would mean "nothing to push"; null means "I could not look". Same false-PASS class
      // as the failed-`git status` case above, so it fails the same way.
      const result = evaluatePreflight(cleanState({ pushableMigrations: null }));
      assert.equal(result.failures, 1);
      assert.match(messages(result), /cannot read supabase\/migrations/);
      assert.doesNotMatch(messages(result), /tracked in Git/);
    });

    it("only warns about untracked files outside the migrations directory", () => {
      const result = evaluatePreflight(cleanState({ untrackedOther: ["docs/plan/x.md"] }));
      assert.equal(result.failures, 0, "untracked docs cannot reach production");
      assert.equal(result.warnings, 1);
      assert.match(messages(result), /cannot affect a push/);
    });

    it("warns rather than fails when the migrations directory does not exist", () => {
      const result = evaluatePreflight(cleanState({ migrationsDirExists: false }));
      assert.equal(result.failures, 0);
      assert.match(messages(result), /does not exist — nothing to push/);
    });
  });

  // Fidelity to the CLI is what makes the check above trustworthy: it must not fail a release
  // over a file `db push` would ignore. Rule taken from supabase/cli `ListLocalMigrations`
  // (`^([0-9]+)_(.*)\.sql$`, top level only, directories skipped) and verified against a live
  // `supabase db push --dry-run`, which pushed a gitignored .sql while skipping an UPPERCASE
  // .SQL and a subdirectory.
  describe("listPushableMigrations mirrors the CLI's file selection", () => {
    function fixture(entries) {
      const dir = mkdtempSync(join(tmpdir(), "preflight-migrations-"));
      for (const [name, isDir] of entries) {
        if (isDir) mkdirSync(join(dir, name));
        else writeFileSync(join(dir, name), "-- probe\n");
      }
      return dir;
    }

    it("selects only top-level .sql files matching <digits>_<name>.sql", () => {
      const dir = fixture([
        ["20260928120000_real.sql", false],
        ["20260928130000_also_real.sql", false],
        ["20990101000000_uppercase.SQL", false],
        ["notes.md", false],
        ["_archive-not-on-remote", true],
      ]);
      try {
        assert.deepEqual(listPushableMigrations(dir), [
          "20260928120000_real.sql",
          "20260928130000_also_real.sql",
        ]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("does not descend into subdirectories, where db push never looks", () => {
      const dir = fixture([["nested", true]]);
      try {
        writeFileSync(join(dir, "nested", "20260928120000_nested.sql"), "-- nested\n");
        assert.deepEqual(listPushableMigrations(dir), []);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("returns nothing instead of throwing when the directory is absent", () => {
      assert.deepEqual(listPushableMigrations(join(tmpdir(), "preflight-migrations-absent")), []);
    });
  });

  describe("dirty tracked tree", () => {
    it("fails when tracked files are modified", () => {
      const result = evaluatePreflight(
        cleanState({ trackedDirty: [" M package.json", " M supabase/migrations/a.sql"] }),
      );
      assert.equal(result.failures, 1);
      assert.match(messages(result), /commit or stash before a release/);
    });

    it("downgrades to a warning under --allow-tracked-dirty", () => {
      const result = evaluatePreflight(
        cleanState({ trackedDirty: [" M package.json"], allowTrackedDirty: true }),
      );
      assert.equal(result.failures, 0);
      assert.equal(result.warnings, 1);
    });

    // Regression: a failed `git status` yielded [], which rendered as "no modified tracked
    // files" — a PASS for a check that never ran.
    it("fails rather than assuming a clean tree when git status cannot run", () => {
      const result = evaluatePreflight(cleanState({ trackedDirty: null }));
      assert.equal(result.failures, 1);
      assert.match(messages(result), /cannot determine whether tracked files are modified/);
      assert.doesNotMatch(messages(result), /no modified tracked files/);
    });
  });

  describe("HEAD vs origin/main direction", () => {
    // Regression: a branch that is merely BEHIND renders as "0 commit(s) ahead" under a naive
    // ahead-only calculation, which reads as "in sync" and is actively misleading.
    it("reports 'behind' when behind, and never '0 commit(s) ahead'", () => {
      const result = evaluatePreflight(
        cleanState({ head: "b".repeat(40), ahead: 0, behind: 3 }),
      );
      const msg = failureMessages(result).join("\n");
      assert.equal(result.failures, 1);
      assert.match(msg, /3 commit\(s\) behind/);
      assert.doesNotMatch(msg, /0 commit\(s\) ahead/);
    });

    it("reports 'ahead' when ahead", () => {
      const result = evaluatePreflight(cleanState({ head: "b".repeat(40), ahead: 2, behind: 0 }));
      assert.match(failureMessages(result).join("\n"), /2 commit\(s\) ahead of/);
    });

    it("reports both directions when diverged", () => {
      const result = evaluatePreflight(cleanState({ head: "b".repeat(40), ahead: 2, behind: 5 }));
      assert.match(failureMessages(result).join("\n"), /2 ahead and 5 behind/);
    });

    it("falls back to 'out of sync' when the counts are unavailable", () => {
      const result = evaluatePreflight(
        cleanState({ head: "b".repeat(40), ahead: null, behind: null }),
      );
      assert.match(failureMessages(result).join("\n"), /out of sync with/);
    });

    it("fails when HEAD or origin/main cannot be resolved", () => {
      const result = evaluatePreflight(cleanState({ head: null, revParseError: "not a git repository" }));
      assert.equal(result.failures, 1);
      assert.match(messages(result), /cannot resolve HEAD or origin\/main/);
    });
  });

  describe("fetch", () => {
    it("fails when the fetch failed, because HEAD vs origin/main is then untrustworthy", () => {
      const result = evaluatePreflight(cleanState({ fetchSkipped: false, fetchError: "network unreachable" }));
      assert.equal(result.failures, 1);
      assert.match(messages(result), /cannot be trusted/);
    });

    it("skips the fetch without complaint under --no-fetch", () => {
      const result = evaluatePreflight(cleanState({ fetchSkipped: true }));
      assert.equal(result.failures, 0);
      assert.match(messages(result), /\(--no-fetch\)/);
    });
  });

  describe("failure accounting", () => {
    it("counts every independent failure at once rather than stopping at the first", () => {
      const result = evaluatePreflight(
        cleanState({
          branch: "feature/x",
          head: "b".repeat(40),
          ahead: 1,
          trackedDirty: [" M package.json"],
          pushableMigrations: ["20260928150000_probe.sql"],
        }),
      );
      assert.equal(result.failures, 4, messages(result));
      assert.equal(result.warnings, 0);
    });
  });
});
