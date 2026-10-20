import test from "node:test";
import assert from "node:assert/strict";
import { localVersions, missingVersions } from "../verify-production-migrations.mjs";

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