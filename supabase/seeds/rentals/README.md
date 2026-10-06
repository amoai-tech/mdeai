# External rental candidates — operator-run seed

These are real marketplace listings captured as **fail-closed candidates**, not verified MDE supply.
They are stored in `public.apartments` with `metadata->>'inventory_kind' = 'external_candidate'`.

They are deliberately **not migrations** and are not part of MDE's configured seed paths
(`supabase/config.toml` `[db.seed]`: `enabled = false`, `sql_paths = ["./seed.sql"]`). Normal
`supabase db push` therefore does not apply them; run the SQL on purpose to one chosen environment.

## Files

| File | Purpose |
|------|---------|
| `external-candidates-2026-10-05.json` | Canonical source artifact: the 5 candidates, prices, and provenance URLs/listing IDs. |
| `external-candidates-2026-10-05.sql` | Exact idempotent `INSERT` that stores the candidates. |

## Apply

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -1 \
  -f supabase/seeds/rentals/external-candidates-2026-10-05.sql
```

Idempotent: the guard is `NOT EXISTS` on `source_url` / `source_listing_id`, so a replay inserts
`0` rows. A fresh environment inserts `5`.

## State contract

New rows must stay `inactive + pending + draft + unconfirmed`, `verified = false`, with **no**
`landlord_id`, `host_id`, coordinates, address, or images. Do **not** flip them to
`active/approved/published` here — external advertisements are not verified MDE inventory.
Promotion happens only through the normal verify → enrich → review → publish workflow.

## Verify

```sql
select title, neighborhood, price_monthly, currency,
       status, moderation_status, listing_workflow_status, verified, freshness_status,
       landlord_id, host_id,
       latitude, longitude, location, address, images,
       source_listing_id, source_url
from public.apartments
where metadata->>'inventory_kind' = 'external_candidate'
order by price_monthly;
```
