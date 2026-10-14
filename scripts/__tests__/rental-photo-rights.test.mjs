import test from "node:test";
import assert from "node:assert/strict";
import {
  REVIEWED_REMOVAL_ALLOWLIST,
  classifyPublicPhoto,
  removalTargets,
} from "../lib/rental-photo-rights.mjs";

const rentJpg = "a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/1777578474641_rent.jpg";

test("external-discovery public photos are never auto-removed", () => {
  assert.equal(
    classifyPublicPhoto({ name: "external-discovery/fincaraiz/x/photo-01.webp", referenced: true }).action,
    "keep",
  );
});

test("an unreferenced allowlisted orphan is removed", () => {
  assert.equal(classifyPublicPhoto({ name: rentJpg, referenced: false }).action, "remove");
});

test("a referenced allowlisted object is kept", () => {
  assert.equal(classifyPublicPhoto({ name: rentJpg, referenced: true }).action, "keep");
});

test("unknown objects are never touched", () => {
  assert.equal(classifyPublicPhoto({ name: "other/photo.jpg", referenced: false }).action, "keep");
});

test("empty names are kept (fail closed)", () => {
  assert.equal(classifyPublicPhoto({ name: "", referenced: false }).action, "keep");
});

test("removalTargets returns only unreferenced allowlisted orphans", () => {
  const targets = removalTargets([
    { name: rentJpg, referenced: false },
    { name: "a5f6adc5-5e86-4730-8ade-3617893a4f68/sweep-test/1777588084265_sweep.jpg", referenced: false },
    { name: "external-discovery/fincaraiz/x/photo-01.webp", referenced: true },
    { name: rentJpg, referenced: true },
  ]);
  assert.equal(targets.length, 2);
  assert.ok(REVIEWED_REMOVAL_ALLOWLIST.includes(targets[0]));
});
