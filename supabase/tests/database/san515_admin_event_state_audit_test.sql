-- SAN-515: Super Admin can change event state with a durable atomic audit;
-- an ordinary signed-in account cannot. All fixtures are rolled back.
begin;
set local search_path = public, extensions;
select plan(25);

create temp table san515_test_actor (admin_id uuid, outsider_id uuid, event_id uuid);
do $fixture$
declare
  v_admin uuid;
  v_outsider uuid;
  v_host uuid;
  v_event uuid;
begin
  insert into auth.users(id,email,aud,role)
    values (gen_random_uuid(),'san515-admin@example.invalid','authenticated','authenticated')
    returning id into v_admin;
  insert into auth.users(id,email,aud,role)
    values (gen_random_uuid(),'san515-outsider@example.invalid','authenticated','authenticated')
    returning id into v_outsider;
  insert into auth.users(id,email,aud,role)
    values (gen_random_uuid(),'san515-host@example.invalid','authenticated','authenticated')
    returning id into v_host;
  insert into public.user_roles (user_id, role)
    values(v_admin, 'super_admin');
  insert into public.events (name,event_start_time,status,is_active,organizer_id)
    values ('SAN-515 local QA audit fixture',now()+interval '30 days','draft',true,v_host)
    returning id into v_event;
  insert into public.event_tickets (event_id,name,price_cents,qty_total)
    values (v_event,'SAN-515 QA tier',500,20);
  insert into san515_test_actor values (v_admin, v_outsider, v_event);
end;
$fixture$;
-- The test uses a temporary ID carrier while switching to authenticated.
grant select on san515_test_actor to authenticated;

select is(has_function_privilege('anon','public.admin_event_set_state(uuid,text)','EXECUTE'),false,'anonymous cannot call admin RPC');
select is(has_function_privilege('authenticated','public.admin_event_set_state(uuid,text)','EXECUTE'),true,'authenticated caller must also pass function role check');
select is(has_table_privilege('authenticated','public.admin_event_state_audit','INSERT'),false,'buyers cannot forge audit entries');

select set_config('request.jwt.claim.sub',(select outsider_id::text from san515_test_actor),true);
set local role authenticated;
select throws_ok($$select public.admin_event_set_state((select a.event_id from san515_test_actor a),'publish')$$,
  '42501', 'admin access required','outsider cannot publish foreign event');
reset role;
select is((select status from public.events where id=(select a.event_id from san515_test_actor a)), 'draft','denied transition leaves status unchanged');
select set_config('request.jwt.claim.sub',(select outsider_id::text from san515_test_actor),true);
set local role authenticated;
with attempted as (
  update public.events set name='outsider forged edit'
  where id=(select a.event_id from san515_test_actor a) returning id
)
select is((select count(*)::int from attempted),0,'outsider cannot edit another organizer event');
select is((select count(*)::int from public.event_tickets
 where event_id=(select a.event_id from san515_test_actor a)), 0,
 'ordinary outsider cannot read private ticket tiers');
reset role;

select set_config('request.jwt.claim.sub',(select admin_id::text from san515_test_actor),true);
set local role authenticated;
select is((select public.admin_event_set_state(event_id,'publish')->>'status' from san515_test_actor), 'published','authorized Super Admin publishes');
select is((select count(*)::int from public.event_tickets
 where event_id=(select a.event_id from san515_test_actor a)), 1,
 'admin can read foreign organizer ticket tier inventory');
reset role;
select is((select status from public.events where id=(select a.event_id from san515_test_actor a)), 'published','event row truly persisted');
select is((select count(*)::int from public.admin_event_state_audit where event_id=(select a.event_id from san515_test_actor a)), 1,'exactly one audit saved');
select is((select before_status||'>'||after_status from public.admin_event_state_audit where event_id=(select a.event_id from san515_test_actor a)), 'draft>published','audit records truthful before/after');
select is((select actor_id from public.admin_event_state_audit where event_id=(select a.event_id from san515_test_actor a)), (select a.admin_id from san515_test_actor a),'audit actor comes from JWT');

-- Super Admin can edit a foreign organizer's event using the canonical
-- editor/RLS path; the shared DB trigger persists that content edit as well.
select set_config('request.jwt.claim.sub',(select admin_id::text from san515_test_actor),true);
set local role authenticated;
update public.events set name='SAN-515 revised QA event'
  where id=(select a.event_id from san515_test_actor a);
reset role;
select is((select count(*)::int from public.admin_event_state_audit
  where event_id=(select a.event_id from san515_test_actor a)), 2,
  'content edit creates a second permanent audit record');
select is((select action from public.admin_event_state_audit
  where action='edit' and event_id=(select a.event_id from san515_test_actor a)),
  'edit','content edit is classified correctly');
select is((select after_fields->>'name' from public.admin_event_state_audit
  where action='edit' and event_id=(select a.event_id from san515_test_actor a)),
  'SAN-515 revised QA event','content audit stores the new real name');
select is((select actor_id from public.admin_event_state_audit
  where action='edit' and event_id=(select a.event_id from san515_test_actor a)),
  (select a.admin_id from san515_test_actor a),'content audit actor is authenticated admin');

-- Audit-insert failure causes the status mutation to roll back as one transaction.
create function pg_temp.san515_reject_audit() returns trigger language plpgsql as $$
begin
  raise exception 'test audit failure' using errcode='P0001';
end;
$$;
create trigger san515_fail_audit before insert on public.admin_event_state_audit
  for each row execute function pg_temp.san515_reject_audit();
select set_config('request.jwt.claim.sub',(select admin_id::text from san515_test_actor),true);
set local role authenticated;
select throws_ok($$select public.admin_event_set_state((select a.event_id from san515_test_actor a),'unpublish')$$,
  'P0001', 'test audit failure','failed audit rejects entire transition');
reset role;
select is((select status from public.events where id=(select a.event_id from san515_test_actor a)), 'published','failed audit rolls back status change');

-- The normal unpublish and restore journeys must also persist and audit.
drop trigger san515_fail_audit on public.admin_event_state_audit;
select set_config('request.jwt.claim.sub',(select admin_id::text from san515_test_actor),true);
set local role authenticated;
select is((select public.admin_event_set_state(event_id,'unpublish')->>'status' from san515_test_actor),
  'draft','admin unpublishes an organizer event');
reset role;
select is((select is_active from public.events where id=(select a.event_id from san515_test_actor a)),
  false,'unpublish deactivates the event');
select is((select before_status||'>'||after_status from public.admin_event_state_audit
  where action='unpublish' and event_id=(select a.event_id from san515_test_actor a)),
  'published>draft','unpublish writes truthful transition audit');
select set_config('request.jwt.claim.sub',(select admin_id::text from san515_test_actor),true);
set local role authenticated;
select is((select (public.admin_event_set_state(event_id,'restore')->>'is_active')::boolean from san515_test_actor),
  true,'admin restores event activity');
reset role;
select is((select status='draft' and is_active from public.events where id=(select a.event_id from san515_test_actor a)),
  true,'restore persists active draft without business approval gate');
select is((select count(*)::int from public.admin_event_state_audit audit
  where audit.action in ('unpublish','restore')
    and audit.actor_id=(select actor.admin_id from san515_test_actor actor)
    and audit.event_id=(select actor.event_id from san515_test_actor actor)),
  2,'unpublish and restore each record the authenticated actor');
select * from finish();
rollback;
