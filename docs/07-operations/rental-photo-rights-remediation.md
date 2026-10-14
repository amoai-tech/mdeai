# Rental photo-rights remediation (SAN-1432 follow-up)

## Why
PR #316 fixed private-verification read access. The remaining SAN-1432 acceptance
criteria concern photos in the **public** `listing-photos` bucket whose rights are
not independently approved. This runbook documents the inventory, the decisions,
and the safe procedure. The actual removal is gated on explicit operator approval.

## Verified inventory (2026-10-14, project zkwcbyxiwklihegjhuql)
Buckets: `listing-photos` (public), `partner-assets` (private), `contracts` and
`identity-docs` (private), `sponsor-assets` (public).

Public `listing-photos` holds 42 objects:
- **36 external-discovery photos** — `external-discovery/fincaraiz/<slug>/photo-0N.webp`.
  Referenced by `apartments.images` and shown on `/rentals`. Their private originals
  already exist in `partner-assets/source-review/fincaraiz/<id>/N-hash.webp` (36 objects).
  All 36 `rental_listing_images` rows are `rights_status=unverified`. The only recorded
  publication basis is `metadata.public_photo_republication_permission =
  user_attested_2026-10-14` — a user attestation, not independent approval.
- **5 identical orphaned JPEGs** — `a5f6adc5-5e86-4730-8ade-3617893a4f68/f0a63f50-dbad-4583-876c-981cd09ebb97/17775784*_rent.jpg`.
  All 39,183 bytes with the same etag `b66f15c01f0333ec62188634d0646cba`. Referenced by
  **zero** `apartments.images` rows and **zero** `rental_listing_images.storage_path` values.
- **1 four-byte artifact** — `a5f6adc5-5e86-4730-8ade-3617893a4f68/sweep-test/1777588084265_sweep.jpg`. Unreferenced.

## Decisions
1. **Remove** the 5 orphaned JPEGs and the 4-byte artifact from the public bucket.
   They are unreferenced duplicates/test residue with no rights basis and no UI dependency.
2. **Policy decision required** for the 36 external-discovery photos. They are referenced
   and currently user-attested for republication. Either:
   - keep them and accept the recorded user attestation, documenting that decision; or
   - quarantine the public copies (cards fall back to the placeholder; the
     "View original listing" link still resolves; private originals stay in `partner-assets`).
   This PR does **not** auto-remove them — the script excludes the `external-discovery/` prefix.

## Safe procedure
Dry run (no writes):
```bash
node --env-file=.env.local scripts/quarantine-unapproved-rental-photos.mjs
```
Apply (only after approval):
```bash
node --env-file=.env.local scripts/quarantine-unapproved-rental-photos.mjs --apply
```
The script uses the server-side service role, considers only the reviewed allowlist in
`scripts/lib/rental-photo-rights.mjs`, refuses any object still referenced by listing data,
never touches `partner-assets`, and is idempotent.

## Verification after apply
- `listing-photos` public object count drops from 42 to 36.
- Anonymous GET of a removed object returns 404.
- Anonymous GET of a private `partner-assets/source-review/...` object returns 403.
- `/rentals` still returns 200; external cards still render; "View original listing" links resolve.

## Source receipts
- Supabase Storage access control — REFERENCE ONLY —
  https://supabase.com/docs/guides/storage/security/access-control
  Public-bucket downloads bypass RLS, so unapproved objects must leave the public bucket
  rather than rely on a policy; the whole bucket is not made private because existing
  external-discovery URLs must keep working.
