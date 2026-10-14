import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWLIST_NAMES,
  REVIEWED_REMOVAL_ALLOWLIST,
  buildRemovalPlan,
  classifyPublicPhoto,
  extractReferencedListingPhotoNames,
  hasMorePages,
  normalizeEtag,
  objectNameFromReference,
  removalTargets,
  verifyTargetIntegrity,
} from "../lib/rental-photo-rights.mjs";

const rentJpg = "a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/1777578474641_rent.jpg";
const sweep = "a5f6adc5-5e86-4730-8ade-3617893a4f68/sweep-test/1777588084265_sweep.jpg";
const publicUrl = (name) =>
  "https://zkwcbyxiwklihegjhuql.supabase.co/storage/v1/object/public/listing-photos/" + name;

test("every allowlist entry records a reviewed size and etag", () => {
  assert.equal(REVIEWED_REMOVAL_ALLOWLIST.length, 6);
  for (const entry of REVIEWED_REMOVAL_ALLOWLIST) {
    assert.equal(typeof entry.name, "string");
    assert.ok(entry.size > 0);
    assert.ok(entry.etag.length >= 16);
  }
});

test("normalizeEtag strips Storage quoting", () => {
  assert.equal(normalizeEtag('"abc123"'), "abc123");
  assert.equal(normalizeEtag(" abc123 "), "abc123");
});

test("integrity passes when size and etag match", () => {
  const entry = REVIEWED_REMOVAL_ALLOWLIST[0];
  assert.equal(verifyTargetIntegrity(entry, { size: entry.size, etag: '"' + entry.etag + '"' }).ok, true);
});

test("integrity fails on a changed size", () => {
  const entry = REVIEWED_REMOVAL_ALLOWLIST[0];
  assert.equal(verifyTargetIntegrity(entry, { size: entry.size + 1, etag: entry.etag }).ok, false);
});

test("integrity fails on a changed etag", () => {
  const entry = REVIEWED_REMOVAL_ALLOWLIST[0];
  assert.equal(verifyTargetIntegrity(entry, { size: entry.size, etag: "deadbeef" }).ok, false);
});

test("integrity fails when the object is missing", () => {
  assert.equal(verifyTargetIntegrity(REVIEWED_REMOVAL_ALLOWLIST[0], null).ok, false);
});

test("pagination continues only on a full page", () => {
  assert.equal(hasMorePages(1000, 1000), true);
  assert.equal(hasMorePages(999, 1000), false);
  assert.equal(hasMorePages(0, 1000), false);
});

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
  assert.equal(buildRemovalPlan(objects).find((entry) => entry.name === rentJpg).decision.action, "keep");
  assert.deepEqual(removalTargets(objects), [sweep]);
  assert.ok(ALLOWLIST_NAMES.has(sweep));
});
