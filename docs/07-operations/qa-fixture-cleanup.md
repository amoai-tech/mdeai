# QA fixture cleanup

Production is the only Supabase project, so QA runs must not leave labelled rows in the live event list.

## Commands

```bash
cd /home/sk/mdeai
set -a; . ./.env; set +a
npm run qa:cleanup                  # dry run: names and order counts
npm run qa:cleanup -- --apply       # delete, after writing `tmp/qa/qa-cleanup-backup.json`
```

Selection requires both a fixed name prefix and a QA organizer (`qa-%@mdeai.co`), so a real event named `[QA]` by a customer is never selected. The allowlist is fixed in `scripts/cleanup-qa-fixtures.mjs`:

- `[QA]%`
- `QA HITL%`
- `QA SAN-896%`
- `[QA DELETE]%`
- `[QA DEMO]%`

The backup file is not overwritten: an existing `tmp/qa/qa-cleanup-backup.json` aborts the apply until it is moved. The scheduled workflow uploads it as a run artifact. Every child table that references `events` is deleted in the same transaction, including tickets, orders, attendees, check-ins, embeddings, media, promo codes, sponsors, stakeholders, vendors and wait lists. The script re-queries the allowlist before commit and fails if anything remains. It never prints secrets.

## Scheduling

Run after any production QA session, and at most once daily. A safe cron shape is:

```cron
17 3 * * * cd /home/sk/mdeai && mkdir -p tmp/qa && set -a && . ./.env && set +a && npm run qa:cleanup -- --apply >> tmp/qa/cleanup.log 2>&1
```

Do not put service-role credentials in the crontab or a GitHub workflow variable that is visible to pull requests. Use the machine's ignored `.env` or a protected secret store.

The scheduled workflow `.github/workflows/qa-fixture-cleanup.yml` runs this daily on `main`; manual runs are read-only dry runs. It never runs on pull requests. Apply manually with `npm run qa:cleanup -- --apply`.
