# Source-linked Fincaraíz publication — state and recovery

## Verified state (2026-10-14)

- The user expressly confirmed permission from the Fincaraíz advertisers/photo
  rights holders to publicly republish the **36 photos**. MDE records this
  permission as `public_photo_republication_permission=user_attested_2026-10-14`.
  No additional photo-permission verification or marker is required for
  **source-linked external discovery**. If permission is later withdrawn or
  disputed, promptly remove affected public photo URLs and objects after
  checking their references.
- The nine fixed-allowlist apartments have
  `metadata.external_discovery_publication=user_authorized_2026-10-14`,
  `images` with four scoped public `listing-photos` URLs each, and 36 matching
  public Storage objects. Their original `partner-assets` evidence remains private.
- All nine remain `inactive/pending/draft/verified=false`. Only source-linked
  discovery is allowed; no MDE viewing request/booking is enabled.
- Independently checked live Supabase counts: 9 approved, 9×4 public URLs,
  36 public objects, 7 PostGIS points. **This proves public Storage and data
  state, not that the current production website has merged this PR.**

## Safe verification and rerun

1. Inspect live `apartments` rows scoped to the nine exact slugs and landlord
   profile. Confirm states, `metadata`, photo arrays and the 36 Storage objects.
2. Use `node --env-file=.env.local scripts/publish-fincaraiz-external-photos.mjs`
   to validate. No `--apply` means no writes.
3. If all nine published rows match exactly, both dry-run and `--apply` report
   `ALREADY PUBLISHED` and do **no writes**.
4. If any apartment is partially published, script **fails closed**. Do not rerun
   automatically or delete everything in `listing-photos`.

## Partial-release recovery

The Storage service and Postgres do **not** participate in one atomic
transaction. A runtime error may leave:
- Orphan public Storage files after uploads but before DB publication.
- A subset of published DB rows. Script attempts to restore previously updated
  rows, but a network failure can prevent the compensation itself.

For an interrupted operation, **stop the release**. Inspect all nine apartment
`images`, publication flags and the exact Storage prefix
`listing-photos/external-discovery/fincaraiz/<approved-slug>/`. Compare against
the original private references (do not delete `partner-assets`). Use Supabase
Storage `remove` only for **orphaned objects confirmed unreferenced by any live
listing**, under the exact approved slug. If a partial DB update remains, restore
that row's recorded original `images`/metadata from the preflight snapshot or
carefully reconcile to a fully validated four-photo state. Recheck the nine rows
and 36 objects before deciding whether another release is needed.

No blanket Storage bucket public-access changes, mass deletions, `TRUNCATE`,
or blind `--apply` retries. If public photo rights are withdrawn, first remove
the URLs from the affected listings and verify no public card shows them, then
remove the exact public objects. Do not change canonical rental verification,
RLS, ownership or viewing authorization to repair photo state.
