/**
 * The served-build fingerprint is read from the same HTML on every smoke run. A shared global
 * regex used with `String.match` is already safe (the spec resets lastIndex), but this test
 * pins the observable contract: two calls must return identical, non-empty chunks. It would
 * fail immediately if someone switched to a stateful `exec`/`test` loop or cached a result.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkFingerprint } from "../prod-behaviour-smoke.mjs";

const HTML = [
  '<link rel="preload" href="/_next/static/chunks/45392-06698315951d739e.js">',
  '<script src="/_next/static/chunks/webpack-1111111111111111.js" defer></script>',
  '<script src="/_next/static/chunks/45392-06698315951d739e.js"></script>',
].join("\n");

test("chunkFingerprint finds the served chunks", () => {
  const result = chunkFingerprint(HTML);
  assert.deepEqual(result.chunks, [
    "/_next/static/chunks/45392-06698315951d739e.js",
    "/_next/static/chunks/webpack-1111111111111111.js",
  ]);
  assert.equal(result.fingerprint.length, 16);
});

test("chunkFingerprint is identical on repeated calls", () => {
  const first = chunkFingerprint(HTML);
  const second = chunkFingerprint(HTML);
  assert.deepEqual(second.chunks, first.chunks);
  assert.equal(second.fingerprint, first.fingerprint);
  assert.ok(first.fingerprint.length > 0);
});

test("chunkFingerprint ignores HTML without build chunks", () => {
  const result = chunkFingerprint("<html><body>no build</body></html>");
  assert.deepEqual(result.chunks, []);
  assert.equal(result.fingerprint.length, 16);
});
