/**
 * Tests for the gate between the dry-run manifest and a real `supabase db push`.
 *
 * These cover the only two things the script promises: it refuses when the environment cannot
 * support a safe push, and it stays silent when it can. Asserting the *absence* of output on the
 * happy path matters — this script sits inside a push pipeline, so anything it prints there is
 * noise an operator has to read past.
 *
 * Runs via `npm run check:release-gates` (node --test scripts/__tests__/*.test.mjs).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../confirm-migration-push.mjs", import.meta.url));

/** A placeholder that is obviously not a real credential. */
const FAKE_URL = "postgresql://user:placeholder@127.0.0.1:5432/placeholder";

function run(env) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    // Start from a clean slate so the host environment cannot accidentally satisfy a check.
    env: { PATH: process.env.PATH, ...env },
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("confirm-migration-push", () => {
  it("refuses when SUPABASE_DB_URL is missing, and names the variable", () => {
    const { status, out } = run({});
    assert.equal(status, 1);
    assert.match(out, /SUPABASE_DB_URL is not set/);
    assert.doesNotMatch(out, /Refusing to push/);
  });

  it("refuses an unacknowledged push even when the URL is set", () => {
    const { status, out } = run({ SUPABASE_DB_URL: FAKE_URL });
    assert.equal(status, 1);
    assert.match(out, /Refusing to push/);
    assert.match(out, /MDEAI_CONFIRM_PUSH=1/);
  });

  it("refuses when the acknowledgement is present but the URL is not", () => {
    const { status, out } = run({ MDEAI_CONFIRM_PUSH: "1" });
    assert.equal(status, 1);
    assert.match(out, /SUPABASE_DB_URL is not set/);
  });

  it("passes silently when the URL is set and the push is acknowledged", () => {
    const { status, out } = run({ SUPABASE_DB_URL: FAKE_URL, MDEAI_CONFIRM_PUSH: "1" });
    assert.equal(status, 0);
    assert.equal(out, "", "a passing gate must print nothing into the push pipeline");
  });

  it("requires the acknowledgement to be exactly '1', not merely truthy", () => {
    for (const value of ["true", "yes", "0", " 1"]) {
      const { status } = run({ SUPABASE_DB_URL: FAKE_URL, MDEAI_CONFIRM_PUSH: value });
      assert.equal(status, 1, `MDEAI_CONFIRM_PUSH=${JSON.stringify(value)} must not be accepted`);
    }
  });

  it("never echoes the connection string back to the operator", () => {
    const { out } = run({ SUPABASE_DB_URL: FAKE_URL });
    assert.doesNotMatch(out, /placeholder/);
  });
});
