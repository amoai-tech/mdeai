#!/usr/bin/env node
/**
 * Quarantine/remove unapproved public rental photos (SAN-1432).
 *
 * Default is a DRY RUN. Pass --apply to execute. Safety gates:
 *   1. only the reviewed allowlist is considered;
 *   2. every listing reference is read with explicit pagination (fail closed);
 *   3. each target's live size and etag must match the reviewed values;
 *   4. post-deletion, the object must be absent and no longer publicly reachable.
 * external-discovery photos are never auto-removed: they are a policy decision.
 *
 * Usage:
 *   node --env-file=.env.local scripts/quarantine-unapproved-rental-photos.mjs
 *   node --env-file=.env.local scripts/quarantine-unapproved-rental-photos.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import {
  LISTING_PHOTOS_BUCKET,
  REVIEWED_REMOVAL_ALLOWLIST,
  buildRemovalPlan,
  extractReferencedListingPhotoNames,
  hasMorePages,
  removalTargets,
  verifyTargetIntegrity,
} from "./lib/rental-photo-rights.mjs";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Expected server-side Supabase credentials");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** Read every row; a failed page aborts rather than silently under-reading. */
async function fetchAllRows(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from(table).select(columns).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (!hasMorePages(page.length, pageSize)) return rows;
  }
}

/** Current size/etag for one object, or null when absent. A list error aborts. */
async function fetchObjectMeta(name) {
  const parts = name.split("/");
  const file = parts.pop();
  const { data, error } = await db.storage.from(LISTING_PHOTOS_BUCKET).list(parts.join("/"), { search: file, limit: 100 });
  if (error) throw error;
  const entry = (data ?? []).find((item) => item.name === file);
  if (!entry) return null;
  return {
    size: entry.metadata?.size ?? entry.metadata?.contentLength,
    etag: entry.metadata?.eTag ?? entry.metadata?.etag,
  };
}

const apartments = await fetchAllRows("apartments", "images");
const imageRows = await fetchAllRows("rental_listing_images", "storage_path");
const referencedNames = extractReferencedListingPhotoNames(apartments, imageRows);

const objects = REVIEWED_REMOVAL_ALLOWLIST.map((entry) => ({
  name: entry.name,
  referenced: referencedNames.has(entry.name),
}));
const plan = buildRemovalPlan(objects);
for (const entry of plan) {
  console.log([entry.decision.action.toUpperCase(), entry.name, "-", entry.decision.reason].join(" "));
}

const targets = removalTargets(objects).filter((name) => !name.startsWith("external-discovery/"));
if (targets.length === 0) {
  console.log("No removable objects. Nothing to do.");
  process.exit(0);
}
// 1 · Verify live bytes match the reviewed values (read-only, runs in dry-run too).
const entryByName = new Map(REVIEWED_REMOVAL_ALLOWLIST.map((entry) => [entry.name, entry]));
for (const name of targets) {
  const actual = await fetchObjectMeta(name);
  const integrity = verifyTargetIntegrity(entryByName.get(name), actual);
  if (!integrity.ok) throw new Error("Refusing to remove " + name + ": " + integrity.reason);
  console.log("PREFLIGHT OK " + name + " - " + integrity.reason);
}

if (!apply) {
  console.log(`DRY RUN: ${targets.length} object(s) would be removed. Re-run with --apply.`);
  process.exit(0);
}

// 2 · Delete through the Storage API (permanent; see the runbook).
const { error: removeError } = await db.storage.from(LISTING_PHOTOS_BUCKET).remove(targets);
if (removeError) throw removeError;
console.log("Removed " + targets.length + " unapproved public object(s).");

// 3 · Prove each object is gone and no longer publicly reachable.
for (const name of targets) {
  const stillThere = await fetchObjectMeta(name); // throws on list error
  if (stillThere) throw new Error("Object still present after removal: " + name);
  const publicUrl = url.replace(/\/+$/, "") + "/storage/v1/object/public/" + LISTING_PHOTOS_BUCKET + "/" + name;
  const response = await fetch(publicUrl, { method: "HEAD" });
  if (response.status === 200) throw new Error("Object still publicly accessible: " + name);
  console.log("VERIFIED GONE " + name + " - absent from listing, public HTTP " + response.status);
}
