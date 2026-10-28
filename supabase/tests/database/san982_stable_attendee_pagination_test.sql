-- SAN-982: organizer-scoped paging, search and refresh with 52 ticket holders
-- sharing ONE order timestamp. All test rows roll back.
begin;
set local search_path = public, extensions;
select plan(15);

create temp table san982_actor (host_id uuid, outsider_id uuid, event_id uuid, order_id uuid);
do $fixture$
declare
  v_host uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
  v_ticket uuid := gen_random_uuid();
  v_order uuid;
  v_batch integer;
  v_qty integer;
begin
  insert into auth.users (id,email,aud,role)
  values
    (v_host,'san982-host@example.invalid','authenticated','authenticated'),
    (v_outsider,'san982-outsider@example.invalid','authenticated','authenticated');
  insert into public.events (id,name,event_start_time,status,is_active,organizer_id)
  values (v_event,'SAN-982 local paging QA',now()+interval '20 days','published',true,v_host);
  insert into public.event_tickets (id,event_id,name,price_cents,qty_total)
  values (v_ticket,v_event,'QA tier',1000,100);
  -- Match real checkout quantity limits while sharing a transaction timestamp.
  for v_batch in 0..5 loop
    v_qty := least(10, 52 - v_batch * 10);
    insert into public.event_orders
      (event_id,ticket_id,quantity,total_cents,short_id,buyer_name,buyer_email,access_token,status)
    values (v_event,v_ticket,v_qty,v_qty*1000,'SAN982QA'||v_batch,'QA buyer',
      'san982@example.invalid','san982-local-fixture-'||v_batch,'paid')
    returning id into v_order;
    insert into public.event_attendees
      (id,event_id,ticket_id,order_id,qr_token,full_name,email,status)
    select gen_random_uuid(),v_event,v_ticket,v_order,
      'san982-qr-'||to_char(i,'FM000'), 'Guest '||to_char(i,'FM000'),
      'guest'||to_char(i,'FM000')||'@example.invalid','active'
    from generate_series(v_batch*10+1,v_batch*10+v_qty) i;
  end loop;
  insert into san982_actor values(v_host,v_outsider,v_event,v_order);
end;
$fixture$;

grant select on san982_actor to authenticated, service_role;
select is(has_function_privilege('anon','public.event_attendees_paginated(uuid,text,integer,integer)','EXECUTE'),false,'anonymous cannot invoke attendee RPC');
select is(has_function_privilege('authenticated','public.event_attendees_paginated(uuid,text,integer,integer)','EXECUTE'),true,'host retains attendee RPC grant');

-- Missing/expired JWT subject must never turn an authenticated-role RPC into
-- unrestricted access to names, emails or Stripe payment IDs.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select throws_ok($$select public.event_attendees_paginated((select event_id from san982_actor),'',50,0)$$,
  '42501','UNAUTHENTICATED','authenticated role with no user identity sees no attendees');
reset role;
-- Regression for SAN-982: a signed-in DB role cannot spoof the service-role
-- JWT GUC to bypass organizer authorization when no verified auth.uid() exists.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
set local role authenticated;
select throws_ok($$select public.event_attendees_paginated((select event_id from san982_actor),'',50,0)$$,
  '42501','UNAUTHENTICATED','forged legacy service_role JWT claim cannot read attendee PII');
reset role;
-- The newer JSON claims container must not become another impersonation path.
select set_config('request.jwt.claim.role','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role authenticated;
select throws_ok($$select public.event_attendees_paginated((select event_id from san982_actor),'',50,0)$$,
  '42501','UNAUTHENTICATED','forged JSON-only service_role claim cannot read attendee PII');
reset role;
select set_config('request.jwt.claims','',true);
select set_config('request.jwt.claim.role','authenticated',true);

-- Trusted service role retains its documented server-side read path.
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select is((public.event_attendees_paginated((select event_id from san982_actor),'',50,0)->>'total')::integer,
  52,'service role can read without user identity');
reset role;
-- Direct database service_role calls may not carry a JWT role claim.
select set_config('request.jwt.claim.role','',true);
set local role service_role;
select is((public.event_attendees_paginated((select event_id from san982_actor),'',50,0)->>'total')::integer,
  52,'direct service role can read without JWT claims');
reset role;
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub',(select host_id::text from san982_actor),true);
set local role authenticated;
select is((public.event_attendees_paginated((select event_id from san982_actor),'',50,0)->>'total')::integer,52,'host sees the real total');
select is(jsonb_array_length(public.event_attendees_paginated((select event_id from san982_actor),'',50,0)->'rows'),50,'first page contains 50 attendees');
select is(jsonb_array_length(public.event_attendees_paginated((select event_id from san982_actor),'',50,50)->'rows'),2,'second page contains two remaining attendees');
with page1 as (select jsonb_array_elements(public.event_attendees_paginated((select event_id from san982_actor),'',50,0)->'rows') r),
page2 as (select jsonb_array_elements(public.event_attendees_paginated((select event_id from san982_actor),'',50,50)->'rows') r)
select is((select count(distinct r->>'id')::integer from (select r from page1 union all select r from page2) all_rows),52,'pages do not duplicate or drop attendees sharing a timestamp');
select is((public.event_attendees_paginated((select event_id from san982_actor),'guest051',50,0)->>'total')::integer,1,'search filters attendees by name or email');
select is(public.event_attendees_paginated((select event_id from san982_actor),'',50,0)->'rows',
  public.event_attendees_paginated((select event_id from san982_actor),'',50,0)->'rows',
  'refresh returns stable first-page ordering');
reset role;

update public.event_attendees set qr_used_at = now()
where event_id=(select event_id from san982_actor) and email='guest051@example.invalid';

select set_config('request.jwt.claim.sub',(select host_id::text from san982_actor),true);
set local role authenticated;
select is((public.event_attendees_paginated((select event_id from san982_actor),'guest051',50,0)->'rows'->0->>'qr_used_at') is not null,
  true,'check-in state is visible on refresh');
reset role;

select set_config('request.jwt.claim.sub',(select outsider_id::text from san982_actor),true);
set local role authenticated;
select throws_ok($$select public.event_attendees_paginated((select event_id from san982_actor),'',50,0)$$,
  'P0001','NOT_ORGANIZER','foreign host cannot read another host attendee pages');
reset role;
select * from finish();
rollback;
