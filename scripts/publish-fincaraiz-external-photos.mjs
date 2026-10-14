/**
 * One-time, explicitly authorized source-linked external discovery release.
 * Reusable and idempotent. Source evidence stays in private partner-assets.
 *
 * Preview: node --env-file=.env.local scripts/publish-fincaraiz-external-photos.mjs
 * Commit:  node --env-file=.env.local scripts/publish-fincaraiz-external-photos.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';

const slugs = new Set([
  'candidate-fincaraiz-193916988', 'candidate-fincaraiz-192658136',
  'candidate-fincaraiz-194158672', 'candidate-fincaraiz-194188459',
  'candidate-fincaraiz-193811264', 'candidate-fincaraiz-194104380',
  'candidate-fincaraiz-194115640', 'candidate-fincaraiz-194096982',
  'candidate-fincaraiz-193522702',
]);
const landlord = 'a4da05ae-347e-4250-8ae0-83812ccc7703';
const apply = process.argv.includes('--apply');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error('Expected server-side Supabase credentials');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: bucket, error: bucketError } = await db.storage.getBucket('listing-photos');
if (bucketError || !bucket?.public) throw Error('Destination bucket must already be public');

const {data: rows, error: rowError} = await db.from('apartments')
  .select('id,slug,landlord_id,status,listing_workflow_status,moderation_status,verified,metadata,images,source_url,available_from')
  .eq('landlord_id', landlord).in('slug', [...slugs]);
if (rowError || rows?.length !== 9) throw Error('Expected exactly 9 owned external candidates');
for (const r of rows) {
  if (!slugs.has(r.slug) || r.status !== 'inactive' || r.listing_workflow_status !== 'draft'
      || r.moderation_status !== 'pending' || r.verified !== false
      || r.available_from !== '2026-10-14'
      || r.metadata?.inventory_kind !== 'external_candidate'
      || r.metadata?.allowed_action !== 'view_original_listing'
      || !/^https:\/\/(?:www\.)?fincaraiz\.com\.co\//i.test(r.source_url)) {
    throw Error('Refusing changed external candidate ' + r.slug);
  }
}
const {data: photos, error: photosError} = await db.from('rental_listing_images')
  .select('listing_id,sort_order,storage_path,mime_type')
  .in('listing_id', rows.map(r=>r.id));
if (photosError || photos?.length !== 36) throw Error('Expected exactly 36 linked research photos');
const batch = rows.map(r => {
  const files = photos.filter(p=>p.listing_id===r.id).sort((a,b)=>a.sort_order-b.sort_order);
  if (files.length !== 4) throw Error('Four photos required for ' + r.slug);
  files.forEach((f,i)=>{
    const allowedPrefix = 'partner-assets/source-review/fincaraiz/' + r.id + '/';
    const filename = f.storage_path?.startsWith(allowedPrefix)
      ? f.storage_path.slice(allowedPrefix.length) : '';
    // Reject traversal or nested paths without using an unbounded-input regex.
    const safeFilename = filename.length > 5 && filename.length <= 100
      && filename.endsWith('.webp') && !filename.includes('/')
      && !filename.includes('\\')
      && [...filename].every(char => 'abcdefghijklmnopqrstuvwxyz0123456789-.'.includes(char));
    if (f.sort_order !== i || f.mime_type !== 'image/webp' || !safeFilename) {
      throw Error('Unsafe source photo reference in ' + r.slug);
    }
  });
  return {row:r,files};
});
console.log('Validated nine scoped advertisements and 36 private source photos; apply=',apply);
if (!apply) process.exit(0);

const destination = db.storage.from('listing-photos');
const saved = [];
// Stage and verify *all* objects before changing any publicly discoverable record.
for (const {row,files} of batch) {
  const urls = [];
  for (const file of files) {
    const sourceObject = file.storage_path.slice('partner-assets/'.length);
    const targetObject = 'external-discovery/fincaraiz/' + row.slug +
      '/photo-' + String(file.sort_order + 1).padStart(2,'0') + '.webp';
    const {data:blob,error:downloadError} = await db.storage.from('partner-assets').download(sourceObject);
    if (downloadError || !blob) throw Error('Cannot read approved source image ' + row.slug);
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.byteLength < 1000 || buffer.byteLength > 5_000_000) throw Error('Unexpected image size');
    const {error:uploadError} = await destination.upload(targetObject,buffer,{
      upsert:true,contentType:'image/webp',cacheControl:'3600'
    });
    if (uploadError) throw Error('Upload failed for '+row.slug+': '+uploadError.message);
    const publicUrl = destination.getPublicUrl(targetObject).data.publicUrl;
    const response = await fetch(publicUrl,{signal:AbortSignal.timeout(12000)});
    if (!response.ok || !response.headers.get('content-type')?.includes('image/')) {
      throw Error('Public image inaccessible: ' + row.slug + ' file ' + file.sort_order);
    }
    urls.push(publicUrl);
  }
  saved.push({row,urls});
  console.log('Uploaded and verified 4 public images for',row.slug);
}
// Publish exactly the candidate rows, without touching their verified/booking state.
for (const {row,urls} of saved) {
  const updatedMetadata = {
    ...row.metadata,
    external_discovery_publication:'user_authorized_2026-10-14',
    external_discovery_type:'source_linked_external_advertisement',
    public_photo_republication_permission:'user_attested_2026-10-14',
    photo_rights_independently_verified:false,
  };
  const {data,error} = await db.from('apartments')
    .update({images:urls,metadata:updatedMetadata})
    .eq('id',row.id).eq('landlord_id',landlord)
    .eq('status','inactive').eq('listing_workflow_status','draft')
    .select('slug,images,status,listing_workflow_status,verified,metadata');
  if (error || data?.length !== 1 || data[0].images?.length !== 4
      || data[0].status !== 'inactive' || data[0].listing_workflow_status !== 'draft'
      || data[0].verified !== false) throw Error('Post-update invariant failed for '+row.slug);
}
const {data:verified,error:readbackError} = await db.from('apartments')
  .select('slug,images,status,listing_workflow_status,verified,metadata')
  .eq('landlord_id',landlord).in('slug',[...slugs]);
if (readbackError || verified?.length !== 9
  || verified.some(r=>r.images?.length !== 4
    || r.metadata?.external_discovery_publication !== 'user_authorized_2026-10-14'
    || r.status !== 'inactive' || r.listing_workflow_status !== 'draft'
    || r.verified !== false)) throw Error('Final nine-listing verification failed');
console.log('SUCCESS: 9 externally discoverable records / 36 public image URLs. Verified viewing restrictions unchanged.');
