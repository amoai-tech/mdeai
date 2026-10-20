import test from "node:test";
import assert from "node:assert/strict";
import { localVersions, missingVersions, trustedSupabaseOrigin } from "../verify-production-migrations.mjs";

test("missingVersions reports nothing when production is current", () => {
  assert.deepEqual(missingVersions(["20261001", "20261002"], ["20261001", "20261002"]), []);
});

test("missingVersions reports only the versions production lacks", () => {
  assert.deepEqual(
    missingVersions(["20261001", "20261002", "20261003"], ["20261001"]),
    ["20261002", "20261003"],
  );
});

test("missingVersions tolerates the ledger returning numbers", () => {
  assert.deepEqual(missingVersions(["20261001"], [20261001]), []);
});

test("missingVersions treats an empty ledger as everything missing", () => {
  assert.deepEqual(missingVersions(["20261001"], []), ["20261001"]);
});

test("localVersions reads the real directory, sorted and only CLI-shaped names", () => {
  const versions = localVersions();
  assert.ok(versions.length > 0, "the repository must contain migrations");
  assert.deepEqual([...versions].sort(), versions, "versions are sorted");
  for (const version of versions) assert.match(version, /^\d+$/);
});

test("trustedSupabaseOrigin accepts a supabase project host over https", () => {
  assert.equal(
    trustedSupabaseOrigin("https://abcdefgh.supabase.co", undefined),
    "https://abcdefgh.supabase.co",
  );
});

test("trustedSupabaseOrigin rejects plain http", () => {
  assert.throws(
    () => trustedSupabaseOrigin("http://abcdefgh.supabase.co", undefined),
    /must use https/,
  );
});

test("trustedSupabaseOrigin rejects an internal address", () => {
  assert.throws(
    () => trustedSupabaseOrigin("https://169.254.169.254", undefined),
    /refusing to send the service key/,
  );
});

test("trustedSupabaseOrigin rejects localhost", () => {
  assert.throws(
    () => trustedSupabaseOrigin("https://localhost:54321", undefined),
    /refusing to send the service key/,
  );
});

test("trustedSupabaseOrigin rejects a lookalike host", () => {
  assert.throws(
    () => trustedSupabaseOrigin("https://evil-supabase.co.attacker.test", undefined),
    /refusing to send the service key/,
  );
});

test("trustedSupabaseOrigin allows an explicitly declared self-hosted host", () => {
  assert.equal(
    trustedSupabaseOrigin("https://db.internal.example", "db.internal.example"),
    "https://db.internal.example",
  );
});

test("trustedSupabaseOrigin rejects a malformed URL", () => {
  assert.throws(() => trustedSupabaseOrigin("not a url", undefined), /not a valid URL/);
});