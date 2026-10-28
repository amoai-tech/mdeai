-- SAN-1604 · transactional Supabase SQL integration: change, retry, conflict, denied, reverse.
-- Run after migration. No fixture survives.
BEGIN;
set local search_path=public,extensions;
select plan(1);
-- Executed only inside BEGIN/ROLLBACK against local Supabase Docker, never production.
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
values
('fa1fa1fa-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','san1604-admin@qa.local','x',now(),now()),
('fa1fa1fa-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','san1604-partner@qa.local','x',now(),now());
insert into public.profiles (id,email) values
('fa1fa1fa-0000-4000-8000-000000000001','san1604-admin@qa.local'),
('fa1fa1fa-0000-4000-8000-000000000002','san1604-partner@qa.local')
on conflict (id) do nothing;
insert into public.user_roles (user_id,role) values
('fa1fa1fa-0000-4000-8000-000000000001','super_admin'),
('fa1fa1fa-0000-4000-8000-000000000002','user') on conflict do nothing;
insert into public.partners (id, profile_id, type, settings) values
('fa1fa1fa-0000-4000-8000-000000000011','fa1fa1fa-0000-4000-8000-000000000001','venue','{"businessName":"QA Venue A"}'),
('fa1fa1fa-0000-4000-8000-000000000012','fa1fa1fa-0000-4000-8000-000000000002','venue','{"businessName":"QA Venue B"}');
select set_config('request.jwt.claim.sub','fa1fa1fa-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare v_restaurant uuid; v_json jsonb; v_count integer; v_conflict boolean := false; v_denied boolean := false;
begin
  select id into v_restaurant from public.restaurants where partner_id is null order by id limit 1;
  if v_restaurant is null then raise exception 'No local restaurant fixture'; end if;
  v_json := public.restaurant_admin_transfer(v_restaurant,'fa1fa1fa-0000-4000-8000-000000000011',null,'QA A handoff');
  if v_json->>'partnerId' <> 'fa1fa1fa-0000-4000-8000-000000000011' or v_json->>'changed' <> 'true' or v_json->>'auditId' is null then
    raise exception 'Expected persisted transfer + audit reference: %',v_json;
  end if;
  v_json := public.restaurant_admin_transfer(v_restaurant,'fa1fa1fa-0000-4000-8000-000000000011',null,'QA retry');
  if v_json->>'changed' <> 'false' then raise exception 'Retry was not idempotent'; end if;
  begin
    perform public.restaurant_admin_transfer(v_restaurant,'fa1fa1fa-0000-4000-8000-000000000012',null,'QA stale');
  exception when sqlstate 'P0001' then v_conflict := true;
  end;
  if not v_conflict then raise exception 'Stale change was not rejected'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','fa1fa1fa-0000-4000-8000-000000000002',true);
  begin
    perform public.restaurant_admin_transfer(v_restaurant,null,'fa1fa1fa-0000-4000-8000-000000000011','QA outsider');
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Non-admin transfer was not rejected'; end if;
  v_denied := false;
  begin
    update public.restaurants set partner_id='fa1fa1fa-0000-4000-8000-000000000012' where id=v_restaurant;
    get diagnostics v_count = row_count;
    v_denied := v_count = 0;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Direct non-admin assignment not denied'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub','fa1fa1fa-0000-4000-8000-000000000001',true);
  -- Simulate another HTTP/PostgREST request: transaction-local RPC proof is absent.
  perform pg_catalog.set_config('mde.restaurant_transfer_actor','',true);
  v_denied := false;
  begin
    update public.restaurants set partner_id='fa1fa1fa-0000-4000-8000-000000000012' where id=v_restaurant;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Direct Super Admin write bypassed canonical RPC'; end if;
  v_json := public.restaurant_admin_transfer(v_restaurant,null,'fa1fa1fa-0000-4000-8000-000000000011','QA restore');
  if v_json->>'changed' <> 'true' or v_json->>'partnerId' is not null then raise exception 'Restore failed: %',v_json; end if;
  raise notice 'PASS: authorized transfer, retry, stale conflict, outsider denial, direct write denial, restore';
end $$;
reset role;
select case when count(*)=2 and count(*) filter (where actor_user_id='fa1fa1fa-0000-4000-8000-000000000001')=2
then 'PASS: exactly 2 correctly attributed audit records' else 'FAIL: audit count or actor' end as audit_assertion
from public.restaurant_partner_assignment_audit where restaurant_id in (select id from public.restaurants) and actor_user_id='fa1fa1fa-0000-4000-8000-000000000001';

select ok((select count(*)=2 from public.restaurant_partner_assignment_audit where actor_user_id='fa1fa1fa-0000-4000-8000-000000000001'),'one audit row per change and no retry duplicate');
select * from finish();
ROLLBACK;
