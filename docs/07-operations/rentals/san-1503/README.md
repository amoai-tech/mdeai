# SAN-1503 · 15-rental import and gallery evidence

**Historical import package. No automatic database import or photo upload.**
Verified against live Supabase project zkwcbyxiwklihegjhuql on 2026-10-17:
15 apartments already imported (2026-10-16), active/published, 464 photos uploaded.
**Never rerun the import against the existing records.**

## Inventory and operating rules
- 15 unique san1503 source import keys; all 15 development-public and requestable
  per current DB functions. verified=false is not an eligibility gate in Phase A.
- 464 Storage objects, 464 gallery rows and 464 apartment.images URLs.
- 13 grounded coordinate pairs, 2 deliberately unknown (no pins).
- Eight USD and seven COP monthly prices; do not conflate currencies.
- Photo rights statuses are unverified provenance, not development approval gates.
- Photo files are deliberately NOT committed, and remain local under photos/rentals.
- Original provider CSV is NOT committed because it contains contact emails and
  third-party source details. Structured facts are included in the SQL.

## Files
- import-15-apartments.reference.sql: historical v2 SQL with embedded values, ends
  in ROLLBACK, kept outside supabase/migrations; hardcoded account email redacted.
  It is NOT directly runnable without deliberately restoring the correct email
  after an independently reviewed fresh-data migration/import plan.
- upload-local-rental-photos.mjs: archived uploader, read-only dry run by default.
  From repository root, with 464 local photos in photos/rentals, use:
      node docs/07-operations/rentals/san-1503/upload-local-rental-photos.mjs
  Run npm ci (including devDependencies) before the dry run; sharp converts the 31 AVIF photos.
  The media directory may be set by MDE_RENTAL_MEDIA_DIR.
  A checkout without the intentionally untracked photo binaries must be pointed
  to the operator's existing folder with MDE_RENTAL_MEDIA_DIR.
  Paths from the manifest are checked against the media directory after
  resolving symlinks; files outside that directory are rejected.
  NEVER run --apply against this already-synced batch: it modifies Storage
  and gallery records and may temporarily hide apartments.
- photo_manifest.csv: checksum and ordering inventory, no binary images.
- photo_summary.csv: original batch summary.
- verify-only.sql: safe read-only current-state queries.

This is NOT independent property ownership, availability or photo-rights
certification. Business permissions/approval checks are deferred until the
owner initiates public launch. Preserve normal auth, tenant isolation, atomic
viewing requests, retries and audit trails.
