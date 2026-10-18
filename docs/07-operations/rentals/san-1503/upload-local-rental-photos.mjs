/**
 * SAN-1503 · photo upload for the 15 imported apartments — v2.
 *
 * Run from the MDE repository root, AFTER SAN-1503-import-15-apartments-public-v2.sql was committed.
 *
 *   Dry run (default, no remote writes; checks files, checksums, AVIF conversion, slugs):
 *     node docs/07-operations/rentals/san-1503/upload-local-rental-photos.mjs
 *
 *   Upload + attach galleries (needs the server-side service key in .env.local):
 *     node --env-file=.env.local docs/07-operations/rentals/san-1503/upload-local-rental-photos.mjs --apply
 *
 *   Only some apartments:   --only=mde-linares-501,mde-casa-palmas
 *
 * Why the "hide -> attach -> publish" sequence:
 *   The database demotes a PUBLISHED apartment back to draft whenever its images or its
 *   rental_listing_images rows change (apartments_material_edit_guard and
 *   rental_listing_images_review_guard). So for each apartment this script
 *     1. uploads all files to storage first (no database change, the listing stays live),
 *     2. briefly sets the apartment to draft (hidden for about a second),
 *     3. writes the gallery rows + apartments.images while it is not live,
 *     4. publishes it again (active / approved / published) — always, even after an error.
 *   If step 4 itself fails, the script prints the exact SQL to republish by hand.
 *
 * Uses the EXISTING apartments table, rental_listing_images table and the listing-photos bucket.
 * The operator authorised development publication of these photos. That is recorded as
 * rights_status = 'unverified' with evidence text; it is NOT proof of third-party copyright permission.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const root = process.cwd();
const mediaDir = path.resolve(process.env.MDE_RENTAL_MEDIA_DIR ?? path.join(root, 'photos', 'rentals'));
const manifestPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'photo_manifest.csv');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null;

const OWNER_ID = '036c956b-22f3-4f6b-ac78-9f97a38582c5'; // MDE operator account (stable database ID)
const IMPORT_BATCH = 'san1503-20261015-15-rentals';
const SUPABASE_HOST = 'zkwcbyxiwklihegjhuql.supabase.co';
const BUCKET = 'listing-photos';
const MAX_BYTES = 5 * 1024 * 1024; // bucket limit
const UPLOAD_PARALLEL = 4;
const RETRIES = 3;
const approvals =
  'MDE owner/operator authorised development photo publishing on 2026-10-16; not independently verified third-party copyright permission';

// Must match the slugs written by the v2 SQL: replace(fixture_slug, 'dev-san1503-', 'mde-').
const slugByName = {
  'Panoramika 1606': 'mde-panoramika-1606',
  'Panoramika 316': 'mde-panoramika-316',
  'Paso de Calais': 'mde-paso-de-calais',
  'Rosa Rental': 'mde-rosa-rental',
  'WE Home': 'mde-we-home',
  'Alto Tesoro 803': 'mde-alto-tesoro-803',
  'Asturias 402': 'mde-asturias-402',
  'Atoshi 1202': 'mde-atoshi-1202',
  'Calle Quinta 701': 'mde-calle-quinta-701',
  'Class Suites 1202': 'mde-class-suites-1202',
  'Go Living 1405': 'mde-go-living-1405',
  'Grand by Linares 1612': 'mde-grand-by-linares-1612',
  'Linares 501': 'mde-linares-501',
  'Laureles Studio': 'mde-laureles-studio',
  'Casa Palmas': 'mde-casa-palmas',
};

function fail(message) {
  throw new Error(message);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry a promise-returning function with exponential backoff. */
async function withRetry(label, fn) {
  let last;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt < RETRIES) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  fail(`${label}: ${last?.message ?? last}`);
}

/** Run async jobs with a small worker pool; keeps input order in the result. */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

function parseCsv(csv) {
  // Handles BOM, quoted fields, escaped quotes, embedded commas and line breaks.
  const rows = [];
  let cell = '';
  let fields = [];
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      fields.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      fields.push(cell);
      cell = '';
      if (fields.some(Boolean)) rows.push(fields);
      fields = [];
    } else cell += c;
  }
  if (quoted) fail('Unterminated quoted CSV field');
  if (cell || fields.length) {
    fields.push(cell);
    rows.push(fields);
  }
  const [cols, ...data] = rows;
  return data.map((record) =>
    Object.fromEntries(cols.map((key, i) => [key.replace(/^﻿/, ''), record[i]])),
  );
}

async function main() {
  // ---- 1. Verify every local file against the manifest (no network) -------------------------
  const manifest = parseCsv((await fs.readFile(manifestPath, 'utf8')).replace(/^﻿/, ''));
  if (manifest.length !== 464) fail(`Expected 464 photo records, found ${manifest.length}`);
  const groups = new Map();
  const all = [];
  for (const row of manifest) {
    const slug = slugByName[row.property_name];
    if (!slug) fail(`Unknown manifest property: ${row.property_name}`);
    const file = path.resolve(mediaDir, row.local_file);
    if (!file.startsWith(mediaDir + path.sep)) fail(`Manifest path escapes photo directory: ${row.local_file}`);
    const body = await fs.readFile(file);
    const hash = createHash('sha256').update(body).digest('hex');
    if (hash !== row.sha256 || body.length !== Number(row.bytes)) fail(`Photo checksum or size mismatch: ${row.local_file}`);
    const n = Number(row.photo_number);
    if (!Number.isInteger(n) || n < 1) fail(`Invalid photo number: ${row.local_file}`);
    const ext = path.extname(file).toLowerCase();
    if (!['.jpg', '.jpeg', '.webp', '.avif'].includes(ext)) fail(`Unsupported image extension: ${row.local_file}`);
    const entry = { row, slug, body, n, ext };
    all.push(entry);
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(entry);
  }
  if (groups.size !== 15) fail(`Expected 15 apartment galleries, found ${groups.size}`);
  for (const [slug, items] of groups) {
    const nums = items.map((x) => x.n).sort((a, b) => a - b);
    if (nums.some((n, i) => n !== i + 1)) fail(`Gapped or duplicate photo numbers: ${slug}`);
  }
  if (only) {
    for (const slug of only) if (!groups.has(slug)) fail(`--only names an unknown apartment: ${slug}`);
    for (const slug of [...groups.keys()]) if (!only.has(slug)) groups.delete(slug);
  }

  // ---- 2. Make sure AVIF -> WebP conversion works (the bucket rejects AVIF) -----------------
  const avifCount = all.filter((x) => x.ext === '.avif').length;
  let sharp = null;
  if (avifCount > 0) {
    try {
      sharp = (await import('sharp')).default;
    } catch {
      fail('AVIF conversion needs the "sharp" package. Install it in the MDE project, then retry. Nothing was uploaded.');
    }
    const sample = all.find((x) => x.ext === '.avif');
    const test = await sharp(sample.body).webp({ quality: 86 }).toBuffer();
    if (!test.length) fail('AVIF -> WebP conversion produced an empty file');
  }

  const planned = [...groups.values()].reduce((n, g) => n + g.length, 0);
  console.log(
    `Verified ${all.length} local photos for 15 apartments (${avifCount} AVIF will be converted to WebP). ` +
      `This run covers ${groups.size} apartments / ${planned} photos.`,
  );
  for (const [slug, items] of groups) console.log(`  ${slug}: ${items.length} photos`);
  if (!apply) {
    console.log('\nDRY RUN ONLY — nothing was uploaded or changed. Run again with --apply.');
    return;
  }

  // ---- 3. Connect (server-side key only; refuse any other project) --------------------------
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side only), e.g. node --env-file=.env.local');
  if (new URL(url).hostname !== SUPABASE_HOST) fail('Unexpected Supabase project. Refusing photo publication.');
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // ---- 4. Resolve the apartments created by the v2 SQL (fail BEFORE any upload) -------------
  const apartments = new Map();
  for (const slug of groups.keys()) {
    const { data, error } = await db
      .from('apartments')
      .select('id,slug,created_by,status,metadata')
      .eq('slug', slug)
      .maybeSingle();
    if (error) fail(`Cannot read apartment ${slug}: ${error.message}`);
    if (!data) fail(`Apartment ${slug} not found. Run SAN-1503-import-15-apartments-public-v2.sql (with COMMIT) first.`);
    if (data.created_by !== OWNER_ID) fail(`Apartment ${slug} is not owned by the operator account`);
    if (data.metadata?.san1503_import_batch !== IMPORT_BATCH) fail(`Apartment ${slug} is not part of import batch ${IMPORT_BATCH}`);
    apartments.set(slug, data);
  }

  // ---- 5. One apartment at a time: upload -> hide -> attach -> publish ----------------------
  let done = 0;
  for (const [slug, entries] of groups) {
    const apt = apartments.get(slug);
    const ordered = [...entries].sort((a, b) => a.n - b.n);

    // 5a. Upload every file first. Storage only; the listing stays live while this runs.
    const uploaded = await pool(ordered, UPLOAD_PARALLEL, async (item) => {
      const converted = item.ext === '.avif';
      const blob = converted ? await sharp(item.body).webp({ quality: 86 }).toBuffer() : item.body;
      if (blob.length > MAX_BYTES) fail(`${slug} photo ${item.n} is larger than the 5 MiB bucket limit after conversion`);
      const outExt = converted ? 'webp' : ['.jpg', '.jpeg'].includes(item.ext) ? 'jpg' : 'webp';
      const contentType = outExt === 'jpg' ? 'image/jpeg' : 'image/webp';
      const outHash = createHash('sha256').update(blob).digest('hex').slice(0, 12);
      const dest = `${OWNER_ID}/san1503/${slug}/${String(item.n).padStart(3, '0')}-${outHash}.${outExt}`;
      await withRetry(`upload ${slug}/${item.n}`, async () => {
        const { data, error } = await db.storage.from(BUCKET).upload(dest, blob, {
          upsert: true,
          contentType,
          cacheControl: '3600',
        });
        if (error || !data) throw new Error(error?.message ?? 'no upload result');
      });
      const { data: link } = db.storage.from(BUCKET).getPublicUrl(dest);
      if (!link?.publicUrl) fail(`Storage URL missing for ${dest}`);
      return { dest, url: link.publicUrl, contentType, n: item.n };
    });

    const imageUrls = uploaded.map((u) => u.url);

    // Existing gallery rows (so a rerun updates instead of duplicating).
    const { data: existing, error: listError } = await db
      .from('rental_listing_images')
      .select('id,storage_path')
      .eq('listing_id', apt.id);
    if (listError) fail(`Cannot read image rows for ${slug}: ${listError.message}`);
    const ids = new Map((existing ?? []).map((x) => [x.storage_path, x.id]));
    const rows = uploaded.map((u) => ({
      id: ids.get(u.dest) ?? randomUUID(),
      listing_id: apt.id,
      storage_path: u.dest,
      source_url: null,
      mime_type: u.contentType,
      sort_order: u.n - 1,
      rights_status: 'unverified',
      rights_evidence: approvals,
    }));

    // 5b-d. Hide, attach, publish — and ALWAYS try to publish again.
    const wasLive = apt.status === 'active';
    const publishPatch = (extra = {}) => ({
      status: 'active',
      moderation_status: 'approved',
      listing_workflow_status: 'published',
      verified: false,
      published_at: new Date().toISOString(),
      published_by: OWNER_ID,
      workflow_changed_by: OWNER_ID,
      workflow_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...extra,
    });
    let attachError = null;
    try {
      if (wasLive) {
        await withRetry(`hide ${slug}`, async () => {
          const { error } = await db
            .from('apartments')
            .update({
              status: 'inactive',
              moderation_status: 'pending',
              listing_workflow_status: 'draft',
              published_at: null,
              published_by: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', apt.id)
            .eq('created_by', OWNER_ID);
          if (error) throw new Error(error.message);
        });
      }
      await withRetry(`gallery rows ${slug}`, async () => {
        const { error } = await db.from('rental_listing_images').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(error.message);
      });
      await withRetry(`images ${slug}`, async () => {
        const { error } = await db
          .from('apartments')
          .update({
            images: imageUrls,
            metadata: { ...(apt.metadata ?? {}), dev_photo_upload_pending: false, dev_photo_count: imageUrls.length },
          })
          .eq('id', apt.id)
          .eq('created_by', OWNER_ID);
        if (error) throw new Error(error.message);
      });
    } catch (err) {
      attachError = err;
    }

    // Publish again no matter what happened above.
    try {
      await withRetry(`publish ${slug}`, async () => {
        const { error } = await db.from('apartments').update(publishPatch()).eq('id', apt.id).eq('created_by', OWNER_ID);
        if (error) throw new Error(error.message);
      });
    } catch (err) {
      console.error(
        `\n!! ${slug} is HIDDEN (draft) because republishing failed: ${err.message}\n` +
          `   Fix by running in the SQL editor:\n` +
          `   update public.apartments set status='active', moderation_status='approved', listing_workflow_status='published', ` +
          `verified=false, published_at=now(), published_by='${OWNER_ID}' where id='${apt.id}';\n`,
      );
      process.exitCode = 1;
    }
    if (attachError) fail(`Gallery attach failed for ${slug}: ${attachError.message}`);
    done += 1;
    console.log(`${slug}: ${imageUrls.length} photos attached and published (${done}/${groups.size})`);
  }

  // ---- 6. Final verification straight from the database --------------------------------------
  const { data: check, error } = await db
    .from('apartments')
    .select('slug,images,status,moderation_status,listing_workflow_status')
    .in('slug', [...groups.keys()]);
  if (error) fail(`Final verification failed: ${error.message}`);
  const good = (check ?? []).filter(
    (x) =>
      (x.images ?? []).length === groups.get(x.slug)?.length &&
      x.status === 'active' &&
      x.moderation_status === 'approved' &&
      x.listing_workflow_status === 'published',
  );
  if (good.length !== groups.size) fail(`Only ${good.length}/${groups.size} apartments have the full gallery AND are published`);
  console.log(`\nSUCCESS: ${good.length}/${groups.size} apartments have every photo and are published. Next: open /rentals and check galleries, maps and Request Viewing.`);
}

main().catch((err) => {
  console.error('SAN-1503 photo upload failed:', err.message);
  process.exitCode = 1;
});
