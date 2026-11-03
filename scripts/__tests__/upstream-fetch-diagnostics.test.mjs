import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { CLASSES, classifyError, fetchComparison } from "../check-skill-upstream-drift.mjs";

test("timeouts are UPSTREAM_UNAVAILABLE, not drift", () => {
  assert.equal(classifyError({ name: "TimeoutError" }), CLASSES.UPSTREAM_UNAVAILABLE);
});

test("HTTP failures keep the status and malformed responses are not drift", async () => {
  const http = mock.method(globalThis, "fetch", async () => ({ ok: false, status: 403 }));
  try {
    assert.deepEqual(await fetchComparison("a/b", "a".repeat(40)), {
      classification: CLASSES.UPSTREAM_UNAVAILABLE,
      reason: "HTTP_403",
    });
  } finally {
    http.mock.restore();
  }
  const malformed = mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ status: "not-a-github-status" }),
  }));
  try {
    assert.deepEqual(await fetchComparison("a/b", "a".repeat(40)), {
      classification: CLASSES.UPSTREAM_UNAVAILABLE,
      reason: "MALFORMED_RESPONSE",
    });
  } finally {
    malformed.mock.restore();
  }
});
