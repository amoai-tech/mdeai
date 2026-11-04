import { strict as assert } from "node:assert";
import {
  canReadModerationPhoto,
  canWriteEntityModeration,
  unavailableModerationResult,
  validStoragePath,
  validModerationResult,
} from "../moderate-asset/security.ts";

const alice = "b0b4974d-b5b2-498a-8dc2-6e0d83139c11";
const bob = "bb7dcff8-65e4-4df3-9a69-26592584c7ac";

Deno.test("photo path is only valid within the configured bucket", () => {
  for (const value of ["", "/start.jpg", "alice//photo.jpg", "../photo.png", "alice/../other.png", "alice\\photo.jpg", 12]) {
    assert.equal(validStoragePath(value), false);
  }
  assert.equal(validStoragePath(`${alice}/photo.jpg`), true);
});

Deno.test("authenticated uploader may moderate only their own user-folder objects", () => {
  assert.equal(canReadModerationPhoto(`${alice}/photo.jpg`, alice, false), true);
  assert.equal(canReadModerationPhoto(`${bob}/photo.jpg`, alice, false), false);
  assert.equal(canReadModerationPhoto(`${alice}-spoof/photo.jpg`, alice, false), false);
  assert.equal(canReadModerationPhoto(`${bob}/photo.jpg`, alice, true), true);
});

Deno.test("entity updates require creator identity or real admin status", () => {
  assert.equal(canWriteEntityModeration(alice, alice, false), true);
  assert.equal(canWriteEntityModeration(alice, bob, false), false);
  assert.equal(canWriteEntityModeration(alice, null, false), false);
  assert.equal(canWriteEntityModeration(alice, bob, true), true);
});

Deno.test("AI outage cannot become a clean review", () => {
  assert.deepEqual(unavailableModerationResult(), {
    label: "unavailable",
    categories_flagged: [],
    confidence: 0,
    reason: "moderation_unavailable",
  });
});

Deno.test("high-confidence clean remains clean; malformed Gemini output is never trusted", () => {
  const highConfidenceClean = {
    label: "clean", confidence: 0.99, categories_flagged: [], reason: "valid headshot",
  };
  assert.equal(validModerationResult(highConfidenceClean), true);
  assert.equal(highConfidenceClean.label, "clean");
  for (const invalid of [
    { ...highConfidenceClean, confidence: NaN },
    { ...highConfidenceClean, confidence: 1.1 },
    { ...highConfidenceClean, confidence: null },
    { ...highConfidenceClean, label: "unavailable" },
    { ...highConfidenceClean, categories_flagged: "none" },
    null,
  ]) {
    assert.equal(validModerationResult(invalid), false);
  }
});
