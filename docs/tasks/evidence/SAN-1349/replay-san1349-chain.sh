#!/usr/bin/env bash
# SAN-1349 · Replay proof for the staged ownership constraint
#
# Proves the exact thing `supabase test db` cannot: that the three SAN-1349 migrations applied
# IN ORDER, to a database that already contains production-shaped violations, (a) block new
# violations immediately, (b) remove ownerless rows from requestable supply, (c) end with a
# VALIDATED constraint, and (d) leave non-violating demo rows and historical leads/showings
# untouched.
#
# It runs against a scratch database restored from a pg_dump of the local stack taken BEFORE the
# SAN-1349 migrations were applied, so the starting state is the real pre-fix schema.
#
# Usage:  bash docs/tasks/evidence/SAN-1349/replay-san1349-chain.sh
set -euo pipefail

CONTAINER=${CONTAINER:-supabase_db_mdeapp}
REPLAY_DB=${REPLAY_DB:-san1349_replay}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
EVID="$ROOT/docs/tasks/evidence/SAN-1349"
PSQL=(docker exec -i "$CONTAINER" psql -U postgres -d "$REPLAY_DB" -v ON_ERROR_STOP=1)

# ── 0. Fresh scratch database from the pre-SAN-1349 dump ────────────────────────────────────
docker exec "$CONTAINER" bash -c "dropdb -U postgres --if-exists $REPLAY_DB && createdb -U postgres $REPLAY_DB"
docker exec "$CONTAINER" bash -c \
  "pg_restore -U postgres -d $REPLAY_DB --no-owner --no-privileges /tmp/pre-san1349.dump >/dev/null 2>&1 || true"

# ── 1. Production-shaped dirty state: 44 ownerless production listings (the real count),
#      5 orphan leads and 4 orphan showings, plus a control set of non-violating demo rows.
#      The demo rows are read from the restored dump, so the control is real data. ───────────
"${PSQL[@]}" > "$EVID/02-replay-01-dirty-state.txt" 2>&1 <<'SQL'
insert into public.apartments (id, title, slug, neighborhood, status, moderation_status,
                               listing_workflow_status, landlord_id, source, available_to)
select gen_random_uuid(), 'Replay ownerless ' || g, 'replay-ownerless-' || g, 'Laureles',
       'active', 'approved', 'published', null, 'seed', null
from generate_series(1, 44) g;

insert into public.leads (id, user_id, source, email, name, apartment_id, preferred_showing_at,
                          intent, status, pipeline_stage, metadata, idempotency_key)
select gen_random_uuid(), null, 'form', 'orphan' || g || '@example.com', 'Orphan',
       (select id from public.apartments where slug = 'replay-ownerless-' || g),
       ('2026-01-1' || (g % 9) || ' 14:00:00+00')::timestamptz, 'rental', 'new',
       'showing_scheduled', jsonb_build_object('listing_id', 'replay-ownerless-' || g),
       'replay-orphan-key-' || g
from generate_series(1, 5) g;

insert into public.showings (lead_id, apartment_id, scheduled_at, status, metadata)
select l.id, l.apartment_id, l.preferred_showing_at, 'scheduled',
       jsonb_build_object('listing_id', l.metadata->>'listing_id')
from public.leads l where l.idempotency_key like 'replay-orphan-key-%'
order by l.idempotency_key limit 4;

select 'violations_before=' || count(*) from public.apartments
 where status='active' and moderation_status='approved'
   and listing_workflow_status='published' and landlord_id is null;
select 'nonviolating_active_before=' || count(*) from public.apartments
 where status='active' and moderation_status <> 'approved';
select 'orphan_leads_before=' || count(*) from public.leads l
 join public.apartments a on a.id=l.apartment_id where a.landlord_id is null;
select 'orphan_showings_before=' || count(*) from public.showings s
 join public.apartments a on a.id=s.apartment_id where a.landlord_id is null;
SQL

# ── 2. Apply the three SAN-1349 migrations in timestamp order ───────────────────────────────
: > "$EVID/02-replay-02-migrations.txt"
for f in "$ROOT"/supabase/migrations/20260927200924_san1349_enforce_owner_boundary.sql \
         "$ROOT"/supabase/migrations/20260927200925_san1349_remediate_ownerless_supply.sql \
         "$ROOT"/supabase/migrations/20260927200926_san1349_validate_owner_boundary.sql; do
  {
    echo "=== applying $(basename "$f")"
    docker exec -i "$CONTAINER" psql -U postgres -d "$REPLAY_DB" -v ON_ERROR_STOP=1 < "$f"
    echo "=== OK"
  } >> "$EVID/02-replay-02-migrations.txt" 2>&1
done

# ── 3. Post-state assertions. Any failure raises and exits non-zero. ────────────────────────
"${PSQL[@]}" > "$EVID/02-replay-03-post-state.txt" 2>&1 <<'SQL'
do $$
declare
  v_violations integer;
  v_remediated integer;
  v_demo_untouched integer;
  v_orphan_leads integer;
  v_orphan_showings integer;
  v_validated boolean;
  v_rejected boolean := false;
begin
  select count(*)::int into v_violations from public.apartments
   where status='active' and moderation_status='approved'
     and listing_workflow_status='published' and landlord_id is null;
  if v_violations <> 0 then
    raise exception 'ASSERT FAIL: % ownerless production listings remain', v_violations;
  end if;

  select count(*)::int into v_remediated from public.apartments
   where (metadata ? 'san1349_ownerless_remediation')
     and status = 'inactive' and listing_workflow_status = 'paused';
  if v_remediated <> 44 then
    raise exception 'ASSERT FAIL: expected 44 remediated rows, found %', v_remediated;
  end if;

  -- The control: pre-existing active demo rows that were never violations must be untouched.
  select count(*)::int into v_demo_untouched from public.apartments
   where status='active' and moderation_status <> 'approved'
     and not (metadata ? 'san1349_ownerless_remediation');
  if v_demo_untouched <> 10 then
    raise exception 'ASSERT FAIL: expected 10 untouched demo rows, found %', v_demo_untouched;
  end if;

  -- Historical orphans keep their data; they are made unreachable, not reassigned.
  select count(*)::int into v_orphan_leads from public.leads where idempotency_key like 'replay-orphan-key-%';
  select count(*)::int into v_orphan_showings from public.showings s
    join public.leads l on l.id = s.lead_id where l.idempotency_key like 'replay-orphan-key-%';
  if v_orphan_leads <> 5 or v_orphan_showings <> 4 then
    raise exception 'ASSERT FAIL: orphan history mutated (leads=%, showings=%)', v_orphan_leads, v_orphan_showings;
  end if;

  select convalidated into v_validated from pg_constraint
   where conrelid='public.apartments'::regclass and conname='apartments_owner_required_when_published';
  if v_validated is not true then
    raise exception 'ASSERT FAIL: constraint is not validated';
  end if;

  begin
    insert into public.apartments
      (title, slug, neighborhood, status, moderation_status, listing_workflow_status, landlord_id)
    values ('Replay violating', 'replay-violating', 'Laureles', 'active', 'approved', 'published', null);
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'ASSERT FAIL: a new ownerless production listing was accepted';
  end if;

  raise notice 'PASS: 44 remediated, 0 violations, 10 demo rows untouched, 5 leads + 4 showings preserved, constraint validated, new violation rejected with 23514';
end $$;

select 'violations_after=' || count(*) from public.apartments
 where status='active' and moderation_status='approved'
   and listing_workflow_status='published' and landlord_id is null;
select 'remediated_rows=' || count(*) from public.apartments
 where metadata ? 'san1349_ownerless_remediation';
select 'constraint_validated=' || (select convalidated from pg_constraint
 where conrelid='public.apartments'::regclass and conname='apartments_owner_required_when_published');
select 'orphan_leads_after=' || count(*) from public.leads
 where idempotency_key like 'replay-orphan-key-%';
SQL

echo "SAN-1349 replay proof complete. Evidence in $EVID/02-replay-*.txt"
