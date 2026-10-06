# Supabase seed sources

Canonical **source artifacts** (JSON, CSV) for DATA venue seeds. Deployable database SQL normally lives in [`../migrations/`](../migrations/). The operator-run reconciliation seeds documented below are the explicit exception.

| Task | Source files | Applied migration |
|------|--------------|-------------------|
| DATA-035 | `venues/cafes-medellin.curated.json`, `venues/cafes-medellin.seed.json` | `20260529150000_data035_venue_anchors_cafes.sql` |
| DATA-005 | `venues/nightclubs-medellin.curated.json`, `venues/nightclubs-medellin.csv` | `20260530003708_data005_venue_anchors_nightclubs.sql` |
| DATA-006 | `venues/golden-queries-venues.json` | eval harness (no migration) |
| DATA-004 | — (verify-only; legacy `20260404044721_restaurants_seed.sql`) | existing migration |

## Operator-run reconciliation seeds

These are deliberately **not** migrations and are not part of MDE's configured seed paths
(`supabase/config.toml` `[db.seed]`: `enabled = false`, `sql_paths = ["./seed.sql"]`). Normal
`supabase db push` therefore does not apply them. They are committed as a source artifact plus
operator-run SQL and applied manually to the named environment.

| Task | Source files | Applied |
|------|--------------|---------|
| SAN-468 · REAL-002 | `rentals/external-candidates-2026-10-05.json`, `rentals/external-candidates-2026-10-05.sql` | Production `zkwcbyxiwklihegjhuql`, out-of-band 2026-10-05 (no migration) |

Regenerate SQL from curated JSON:

```bash
node --env-file=.env.local scripts/seed-cafe-anchors.mjs --write-sql supabase/migrations/<timestamp>_data035_venue_anchors_cafes.sql
node --env-file=.env.local scripts/seed-nightclub-anchors.mjs --write-sql supabase/migrations/<timestamp>_data005_venue_anchors_nightclubs.sql
```

Listings research (markdown): [`../../tasks/venues/tasks/listings/`](../../tasks/venues/tasks/listings/)
