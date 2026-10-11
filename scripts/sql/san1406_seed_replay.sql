-- Execute with psql -X -v ON_ERROR_STOP=1 -f scripts/sql/san1406_seed_replay.sql
-- Against an isolated LOCAL database after migrations. Never execute on production.
begin;
insert into public.profiles (id, email, full_name)
values ('e1406000-0000-4000-8000-000000000001',
        'san1406-replay@example.com', 'Replay Owner');
insert into public.partners (id, profile_id, type, status)
values ('f1406000-0000-4000-8000-000000000001',
        'e1406000-0000-4000-8000-000000000001', 'developer', 'active');
update public.development_projects
   set partner_id = 'f1406000-0000-4000-8000-000000000001',
       ownership_status = 'claimed',
       price_from_cents = 80800000000
 where slug = 'cittadel';
\ir ../../supabase/migrations/20261010120000_san1406_seed_pilot_expansion.sql
\ir ../../supabase/migrations/20261010120000_san1406_seed_pilot_expansion.sql
do $$
begin
 if not exists (
   select 1 from public.development_projects
   where slug='cittadel' and ownership_status='claimed'
    and partner_id='f1406000-0000-4000-8000-000000000001'::uuid
    and price_from_cents=80800000000
 ) then
   raise exception 'FAIL: seed replay overwrote claimed developer data';
 end if;
 if (select count(*) from public.development_projects where slug='cittadel') <> 1 then
   raise exception 'FAIL: seed replay duplicated Cittadel';
 end if;
end;
$$;
rollback;
