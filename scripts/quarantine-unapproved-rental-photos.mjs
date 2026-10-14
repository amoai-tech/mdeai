#!/usr/bin/env node
/**
 * Quarantine/remove unapproved public rental photos (SAN-1432).
 *
 * Default is a DRY RUN. Pass --apply to execute. It only ever considers the
 * reviewed allowlist in scripts/lib/rental-photo-rights.mjs, and refuses to
 * remove an object still referenced by listing data. external-discovery photos
 * are never auto-removed: they are a policy decision (see the runbook).
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
  removalTargets,
} from "./lib/rental-photo-rights.mjs";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Expected server-side Supabase credentials");

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// What does the listing data still reference? Service role reads every row.
const { data: apartments, error: apartmentError } = await db.from("apartments").select("images");
if (apartmentError) throw apartmentError;
const { data: imageRows, error: imageError } = await db.from("rental_listing_images").select("storage_path");
if (imageError) throw imageError;

const referencedNames = extractReferencedListingPhotoNames(apartments, imageRows);
const objects = REVIEWED_REMOVAL_ALLOWLIST.map((name) => ({
  name,
  referenced: referencedNames.has(name),
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
if (!apply) {
  console.log(`DRY RUN: ${targets.length} object(s) would be removed. Re-run with --apply.`);
  process.exit(0);
}

const { error: removeError } = await db.storage.from(LISTING_PHOTOS_BUCKET).remove(targets);
if (removeError) throw removeError;
console.log("Removed " + targets.length + " unapproved public object(s).");

// Re-list to prove the objects are gone.
for (const name of targets) {
  const parts = name.split("/");
  const file = parts.pop();
  const { data } = await db.storage.from(LISTING_PHOTOS_BUCKET).list(parts.join("/"), { search: file });
  if (data && data.some((entry) => entry.name === file)) {
    throw new Error("Object still present after removal: " + name);
  }
}
console.log("Verified: all targeted objects are gone.");
