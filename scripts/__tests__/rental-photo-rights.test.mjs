import test from "node:test";
import assert from "node:assert/strict";
import {
  REVIEWED_REMOVAL_ALLOWLIST,
  buildRemovalPlan,
  classifyPublicPhoto,
  extractReferencedListingPhotoNames,
  objectNameFromReference,
  removalTargets,
} from "../lib/rental-photo-rights.mjs";

const rentJpg = "a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/1777578474641_rent.jpg";
const sweep = "a5f6adc5-5e86-4730-8ade-3617893a4f68/sweep-test/1777588084265_sweep.jpg";
const publicUrl = (name) =>
  "https://zkwcbyxiwklihegjhuql.supabase.co/storage/v1/object/public/listing-photos/" + name;

test("public URL resolves to the listing-photos object name", () => {
  assert.equal(objectNameFromReference(publicUrl(rentJpg)), rentJpg);
});

test("a bare listing-photos path resolves to the object name", () => {
  assert.equal(objectNameFromReference("listing-photos/" + rentJpg), rentJpg);
});

test("a bare object path resolves to the object name", () => {
  assert.equal(objectNameFromReference(rentJpg), rentJpg);
});

test("private-bucket paths and unrelated URLs are ignored", () => {
  assert.equal(objectNameFromReference("partner-assets/source-review/x.webp"), null);
  assert.equal(objectNameFromReference("https://images.unsplash.com/photo-1"), null);
});

test("an allowlisted object referenced by an apartment URL is kept", () => {
  const referenced = extractReferencedListingPhotoNames([{ images: [publicUrl(rentJpg)] }], []);
  assert.ok(referenced.has(rentJpg));
  assert.equal(classifyPublicPhoto({ name: rentJpg, referenced: referenced.has(rentJpg) }).action, "keep");
});

test("an allowlisted object referenced by a bare path is kept", () => {
  const referenced = extractReferencedListingPhotoNames([{ images: [rentJpg] }], []);
  assert.ok(referenced.has(rentJpg));
  assert.equal(classifyPublicPhoto({ name: rentJpg, referenced: referenced.has(rentJpg) }).action, "keep");
});

test("an unreferenced allowlisted orphan is removed", () => {
  const referenced = extractReferencedListingPhotoNames(
    [{ images: [publicUrl("external-discovery/fincaraiz/x/photo-01.webp")] }],
    [{ storage_path: "partner-assets/source-review/fincaraiz/x/1-a.webp" }],
  );
  assert.equal(classifyPublicPhoto({ name: rentJpg, referenced: referenced.has(rentJpg) }).action, "remove");
});

test("external-discovery public photos are never auto-removed", () => {
  assert.equal(
    classifyPublicPhoto({ name: "external-discovery/fincaraiz/x/photo-01.webp", referenced: true }).action,
    "keep",
  );
});

test("unknown objects are never touched", () => {
  assert.equal(classifyPublicPhoto({ name: "other/photo.jpg", referenced: false }).action, "keep");
});

test("empty names are kept (fail closed)", () => {
  assert.equal(classifyPublicPhoto({ name: "", referenced: false }).action, "keep");
});

test("removalTargets returns only unreferenced allowlisted orphans", () => {
  const referenced = extractReferencedListingPhotoNames([{ images: [publicUrl(rentJpg)] }], []);
  const objects = [
    { name: rentJpg, referenced: referenced.has(rentJpg) },
    { name: sweep, referenced: referenced.has(sweep) },
    { name: "external-discovery/fincaraiz/x/photo-01.webp", referenced: true },
  ];
  const plan = buildRemovalPlan(objects);
  assert.equal(plan.find((entry) => entry.name === rentJpg).decision.action, "keep");
  assert.deepEqual(removalTargets(objects), [sweep]);
  assert.ok(REVIEWED_REMOVAL_ALLOWLIST.includes(sweep));
});
