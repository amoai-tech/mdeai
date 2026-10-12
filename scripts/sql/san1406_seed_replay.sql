-- SAN-1406: replay safety for ALL six production-captured projects.
-- Run ONLY against isolated local DB after migration replay:
-- psql -X -v ON_ERROR_STOP=1 -f scripts/sql/san1406_seed_replay.sql
-- The transaction rolls back; never point this script at production.
\set ON_ERROR_STOP on
begin;

insert into public.profiles (id, email, full_name)
values ('e1406000-0000-4000-8000-000000000001',
        'san1406-replay@example.com', 'Replay Owner');
insert into public.partners (id, profile_id, type, status)
values ('f1406000-0000-4000-8000-000000000001',
        'e1406000-0000-4000-8000-000000000001', 'developer', 'active');

-- Simulate genuine claims and later owner prices on all six projects.
-- If the seed overwrites even one, the snapshot comparison fails.
update public.development_projects
set partner_id='f1406000-0000-4000-8000-000000000001',
    ownership_status='claimed',
    price_from_cents=80800000000,
    price_to_cents=80800000000
where slug in (
 'cittadel','crista','faroverde',
 'los-cambulos','olium-park','reserva-serrat-selva'
);

-- Simulate the developer source not yet captured for an already claimed project.
-- Reserva primary is the price-backed aggregator, so removing its supplemental
-- Monserrate source does not violate the existing primary-source relationship.
delete from public.development_project_sources s
using public.development_projects p
where s.project_id=p.id
  and p.slug='reserva-serrat-selva'
  and p.ownership_status='claimed'
  and s.source_url='https://www.constructoramonserrate.com/projects_types/no-vis/';

create temp table san1406_replay_snapshot as
select p.id, p.slug, to_jsonb(p) as project_before,
  (select coalesce(jsonb_agg(to_jsonb(u) order by u.id), '[]'::jsonb)
     from public.development_unit_types u where u.project_id=p.id) as units_before,
  (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb)
     from public.development_project_sources s where s.project_id=p.id) as sources_before
from public.development_projects p
where p.slug in (
 'cittadel','crista','faroverde',
 'los-cambulos','olium-park','reserva-serrat-selva'
);
do $$
begin
 if (select count(*) from san1406_replay_snapshot) <> 6 then
   raise exception 'FAIL: expected six captured projects before replay';
 end if;
end $$;

-- Deliberately replay the seed TWICE to prove ON CONFLICT stability.
-- Reapply the idempotent integrity migration with a claimed Reserva that has
-- NO Monserrate source; the developer-source insert must skip the claimed row.
\ir ../../supabase/migrations/20261010120000_san1406_seed_pilot_expansion.sql
\ir ../../supabase/migrations/20261010120000_san1406_seed_pilot_expansion.sql
\ir ../../supabase/migrations/20261010120100_san1406_new_projects_integrity.sql

do $$
declare
 mismatch text;
begin
 select snap.slug into mismatch
 from san1406_replay_snapshot snap
 left join public.development_projects p on p.id=snap.id
 where p.id is null
    or p.slug is distinct from snap.slug
    or to_jsonb(p) is distinct from snap.project_before
    or (select coalesce(jsonb_agg(to_jsonb(u) order by u.id),'[]'::jsonb)
        from public.development_unit_types u where u.project_id=snap.id)
       is distinct from snap.units_before
    or (select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb)
        from public.development_project_sources s where s.project_id=snap.id)
       is distinct from snap.sources_before
 limit 1;
 if found then
   raise exception 'FAIL: replay changed project, owner, price, units or sources: %', mismatch;
 end if;
 if (select count(*) from public.development_projects p
     join san1406_replay_snapshot snap on snap.slug=p.slug) <> 6 then
   raise exception 'FAIL: duplicate/missing captured project after replay';
 end if;
 raise notice 'PASS: all 6 projects, ownership/price, unit and source rows unchanged after two seed runs and integrity replay';
end $$;
rollback;
