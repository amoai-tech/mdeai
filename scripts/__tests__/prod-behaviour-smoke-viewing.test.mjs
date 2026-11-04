// skipcq: JS-0833 -- Node .mjs is an ES module; DeepSource misclassifies its parser mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeViewingRejection } from "../prod-behaviour-smoke.mjs";

const unavailable = {
  success: false,
  error: {
    code: "LISTING_UNAVAILABLE",
    message: "This home isn't accepting viewing requests right now. Pick another apartment from the results.",
  },
};

test("accepts a safe 409 response for the deliberately nonexistent listing", () => {
  assert.equal(safeViewingRejection(409, unavailable), true);
});

test("rejects a 409 with database information in an extra response field", () => {
  // The error code and user-facing message are otherwise exactly the safe response.
  assert.equal(safeViewingRejection(409, {
    ...unavailable,
    debug: 'relation "public.leads" does not exist',
  }), false);
  assert.equal(safeViewingRejection(409, {
    ...unavailable,
    debug: 'missing table: private.showings',
  }), false);
});

test("rejects unexpected fields and appended internals in an otherwise valid 409", () => {
  assert.equal(safeViewingRejection(409, {
    ...unavailable,
    error: { ...unavailable.error, detail: 'relation "public.leads" does not exist' },
  }), false);
  assert.equal(safeViewingRejection(409, {
    ...unavailable,
    error: { ...unavailable.error, message: unavailable.error.message + ' relation "public.leads" does not exist' },
  }), false);
  assert.equal(safeViewingRejection(409, { ...unavailable, requestId: "unexpected" }), false);
  assert.equal(safeViewingRejection(409, { ...unavailable, success: "false" }), false);
});

test("preserves the old safe 400 validation response contract", () => {
  assert.equal(safeViewingRejection(400, { error: { code: "VALIDATION_ERROR", message: "Please try again." } }), true);
});

test("rejects false success, wrong codes, and database error leakage", () => {
  assert.equal(safeViewingRejection(200, { success: true }), false);
  assert.equal(safeViewingRejection(409, { success: true, error: unavailable.error }), false);
  assert.equal(safeViewingRejection(409, { error: { code: "AUTH_REQUIRED", message: unavailable.error.message } }), false);
  assert.equal(safeViewingRejection(409, { error: { code: "LISTING_UNAVAILABLE", message: "p1_schedule_tour_atomic: listing rejected" } }), false);
  assert.equal(safeViewingRejection(409, null), false);
});
