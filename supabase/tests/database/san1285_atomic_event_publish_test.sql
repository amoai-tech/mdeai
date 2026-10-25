-- SAN-1285: actual SQL auth, transaction and retry behavior; runs in ROLLBACK.
begin;
set search_path = public, extensions;
select plan(45);

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values
  ('a1285000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1285-host@example.com', now(), now()),
  ('a1285000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'san1285-foreign@example.com', now(), now());

insert into public.profiles (id,email,full_name)
values
  ('a1285000-0000-4000-8000-000000000001','san1285-host@example.com','SAN1285 Host'),
  ('a1285000-0000-4000-8000-000000000002','san1285-foreign@example.com','SAN1285 Foreign')
on conflict (id) do update set full_name = excluded.full_name;

select ok(to_regprocedure('public.publish_event_tx(text,jsonb,text)') is not null,
  '1: canonical atomic publish RPC exists');
select is(has_function_privilege('anon','public.publish_event_tx(text,jsonb,text)','EXECUTE'),
  false,'2: anon lacks EXECUTE');
select is(has_function_privilege('authenticated','public.publish_event_tx(text,jsonb,text)','EXECUTE'),
  true,'3: authenticated has narrowly scoped EXECUTE');
select is((select prosecdef from pg_proc
  where oid='public.publish_event_tx(text,jsonb,text)'::regprocedure),
  true,'3a: publish RPC is SECURITY DEFINER');
select is((select coalesce(array_to_string(proconfig,','),'') from pg_proc
  where oid='public.publish_event_tx(text,jsonb,text)'::regprocedure) like 'search_path=%',
  true,'3b: publish RPC pins search_path');
select is(to_regprocedure('public.publish_event_tx(text,jsonb,jsonb)'),
  null::regprocedure,'3c: only the canonical text-slug signature exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $q$ select public.publish_event_tx('a1285000-0000-4000-8000-000000000099','{"title":"Anon event","dateIso":"2030-10-20T19:00:00Z"}'::jsonb, 'anon-event') $q$,
  '28000','AUTH_REQUIRED','4: missing auth identity denied');
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000011',
    '{"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]}'::jsonb,
    'san1285-concert'
  ) $q$,
  '5: signed-in host publishes one event with two tiers');

select set_config('san1285.event_id',
 (public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000011',
    '{"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]}'::jsonb,
    'san1285-concert-retry-slug'
  )->>'eventId'),true);

select is(
  (public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000011',
    '{"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]}'::jsonb,
    'san1285-concert-another-retry'
  )->>'eventId'),
  current_setting('san1285.event_id'), '6: retries return original persisted event');

select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000011',
    '{"title":"Changed title","dateIso":"2030-10-20T19:00:00Z"}'::jsonb,
    'changed-title'
  ) $q$,
  'P0001','DRAFT_CHANGED','7: existing key cannot publish changed draft');

select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000012',
    '{"title":"Capacity missing","dateIso":"2030-10-20T19:00:00Z","priceMinCop":50000}'::jsonb,
    'capacity-missing'
  ) $q$,
  '22023','TICKET_QUANTITY_REQUIRED','8: paid tier never invents 100 tickets');
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000014',
    '{"title":"Negative price","dateIso":"2030-10-20T19:00:00Z","priceMinCop":-1}'::jsonb,
    'negative-price') $q$,
  '22023','INVALID_TICKET_PRICE','8a: a negative event price is rejected');
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000015',
    '{"title":"Over capacity","dateIso":"2030-10-20T19:00:00Z","capacity":3,"ticketTiers":[{"name":"General","priceCop":10,"quantity":4}]}'::jsonb,
    'over-capacity') $q$,
  '22023','TICKET_CAPACITY_EXCEEDED','8b: allocated tickets cannot exceed declared capacity');
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000016',
    '{"title":"Fractional base price","dateIso":"2030-10-20T19:00:00Z","priceMinCop":50.7}'::jsonb,
    'fractional-base-price') $q$,
  '22023','INVALID_TICKET_PRICE','8c: ticket base price cannot silently round');
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000017',
    '{"title":"Fractional tier price","dateIso":"2030-10-20T19:00:00Z","ticketTiers":[{"name":"General","priceCop":100.5,"quantity":5}]}'::jsonb,
    'fractional-tier-price') $q$,
  '22023','INVALID_TICKET_TIERS','8d: tier price cannot silently round');
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000088',
    '{"title":"Price exceeds minor-unit storage","dateIso":"2030-10-20T19:00:00Z","ticketTiers":[{"name":"General","priceCop":100000000,"quantity":1}]}'::jsonb,
    'san1285-price-overflow') $q$,
  '22023','INVALID_TICKET_TIERS','8e: price above the Stripe minor-unit limit is rejected');
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000011',
    '{"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]}'::jsonb,
    'foreign-host') $q$,
  '42501','FOREIGN_PROPOSAL','8c: foreign user cannot replay someone elses proposal');
reset role;

select is((select count(*)::int from public.events where id=current_setting('san1285.event_id')::uuid),
  1,'9: exactly one event exists');
select is((select count(*)::int from public.event_tickets where event_id=current_setting('san1285.event_id')::uuid),
  2,'10: two tiers committed');
select is((select sum(price_cents)::int from public.event_tickets where event_id=current_setting('san1285.event_id')::uuid),
  12000000,'11: two tier amounts stored in COP minor units');
select is((select min(price_cents) from public.event_tickets where event_id=current_setting('san1285.event_id')::uuid),
  4000000::bigint,'11a: 40000 whole COP becomes 4000000 minor units for Stripe');
select is((select ticket_price_min from public.events where id=current_setting('san1285.event_id')::uuid),
  40000::numeric,'11b: event summary remains in whole COP');

-- A tier above the old int32 minor-unit ceiling must publish without overflow.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(
  (public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000030',
    '{"title":"SAN1285 High Price","dateIso":"2030-10-23T19:00:00Z","ticketTiers":[{"name":"VIP","priceCop":30000000,"quantity":2}]}'::jsonb,
    'san1285-high-price'
  )->>'eventId') is not null,
  true,'11c: a 30,000,000 COP tier publishes without integer overflow');
reset role;
select is(
  (select max(t.price_cents)::bigint from public.event_tickets t
     join public.events e on e.id=t.event_id
    where e.slug='san1285-high-price'),
  3000000000::bigint,'11d: 30,000,000 COP stored as 3,000,000,000 minor units');
select is((select organizer_id from public.events where id=current_setting('san1285.event_id')::uuid),
  'a1285000-0000-4000-8000-000000000001'::uuid,'12: only authenticated host is organizer');
select is((select count(*)::int from public.approval_requests where proposal_id='a1285000-0000-4000-8000-000000000011'),
  1,'13: one durable confirmation request');
select is((select count(*)::int from public.approval_decisions where request_id=
  (select ar.id from public.approval_requests ar where ar.proposal_id='a1285000-0000-4000-8000-000000000011')),
  1,'14: one audit decision');
select ok((select notes like 'MDE_RECEIPT:%' from public.approval_requests where proposal_id='a1285000-0000-4000-8000-000000000011'),
  '15: durable receipt stored on the idempotency anchor');

select is(
  (select status||'/'||source||'/'||created_by::text||'/'||(details#>>'{host_display,name}')
   from public.events where id=current_setting('san1285.event_id')::uuid),
  'published/host_wizard/a1285000-0000-4000-8000-000000000001/SAN1285 Host',
  '15a: identity, publish state and host snapshot are server-forced');

-- A malformed legacy receipt must not abort or duplicate the retry.
update public.approval_requests
set notes='MDE_RECEIPT:{"eventId":"not-a-uuid","slug":"broken"}'
where proposal_id='a1285000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(
  (public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000011',
    $d$ {"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]} $d$::jsonb,
    'san1285-concert-malformed'
  )->>'eventId'),
  current_setting('san1285.event_id'),
  '15b: malformed receipt recovers the linked event');
reset role;
select is((select count(*)::int from public.events where slug='san1285-concert-malformed'),
  0,'15c: malformed receipt recovery creates no second event');

-- A missing receipt on an existing event recovers and repairs the receipt.
update public.approval_requests set notes=null
where proposal_id='a1285000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(
  (public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000011',
    $d$ {"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]} $d$::jsonb,
    'san1285-concert-noreceipt'
  )->>'eventId'),
  current_setting('san1285.event_id'),
  '15d: event-without-receipt retry recovers the same event');
reset role;
select ok((select notes like 'MDE_RECEIPT:%' from public.approval_requests
  where proposal_id='a1285000-0000-4000-8000-000000000011'),
  '15e: recovery repairs the durable receipt');

-- A receipt pointing at a different proposal's event must not be returned.
with other_request as (
  insert into public.approval_requests
    (agent, action_type, subject, payload, risk_level, requested_by, proposal_id)
  values (
    'hostEventAgent','publish_event','Other Event','{}'::jsonb,'medium',
    'a1285000-0000-4000-8000-000000000001','a1285000-0000-4000-8000-000000000019'
  ) returning id
)
insert into public.events
  (source, name, slug, status, organizer_id, created_by, event_start_time, approval_request_id)
select 'host_wizard','Other Event','san1285-other','published',
       'a1285000-0000-4000-8000-000000000001'::uuid,
       'a1285000-0000-4000-8000-000000000001'::uuid,
       '2030-10-20T19:00:00Z'::timestamptz, id
from other_request;
select set_config('san1285.other_event',
  (select id::text from public.events where slug='san1285-other'), true);
update public.approval_requests
set notes = 'MDE_RECEIPT:' || jsonb_build_object(
  'eventId', current_setting('san1285.other_event'),
  'slug', 'san1285-other',
  'proposalId', 'a1285000-0000-4000-8000-000000000011'
)::text
where proposal_id='a1285000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(
  (public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000011',
    $d$ {"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]} $d$::jsonb,
    'san1285-concert-tampered'
  )->>'eventId'),
  current_setting('san1285.event_id'),
  '15f: a receipt for another proposal cannot return that event');
reset role;

-- A pre-#454 legacy event (no approval link) is still returned when the stored
-- receipt matches its slug.
insert into public.events
  (source, name, slug, status, organizer_id, created_by, event_start_time)
values (
  'host_wizard','Legacy Event','san1285-legacy','published',
  'a1285000-0000-4000-8000-000000000001'::uuid,
  'a1285000-0000-4000-8000-000000000001'::uuid,
  '2030-10-22T19:00:00Z'::timestamptz
);
insert into public.approval_requests
  (agent, action_type, subject, payload, risk_level, requested_by, proposal_id, notes)
select
  'hostEventAgent','publish_event','Legacy Event',
  '{"title":"Legacy Event","dateIso":"2030-10-22T19:00:00Z"}'::jsonb,
  'medium','a1285000-0000-4000-8000-000000000001',
  'a1285000-0000-4000-8000-000000000022',
  'MDE_RECEIPT:' || jsonb_build_object(
    'eventId', (select id::text from public.events where slug='san1285-legacy'),
    'slug','san1285-legacy',
    'proposalId','a1285000-0000-4000-8000-000000000022'
  )::text;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(
  (public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000022',
    '{"title":"Legacy Event","dateIso":"2030-10-22T19:00:00Z"}'::jsonb,
    'san1285-legacy'
  )->>'eventId'),
  (select id::text from public.events where slug='san1285-legacy'),
  '15g: a legacy event is recovered only through its matching receipt');
reset role;

-- Invalid dates are user-input errors, not generic server failures.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000023',
    '{"title":"Bad Date","dateIso":"not-a-date"}'::jsonb,
    'bad-date'
  ) $q$,
  '22007',null,'15h: an invalid event date is a classified input error');
reset role;

-- A pre-existing non-approve decision is a conflict with zero writes.
with created as (
  insert into public.approval_requests
    (agent, action_type, subject, payload, risk_level, requested_by, proposal_id)
  values (
    'hostEventAgent','publish_event','SAN1285 Concert',
    $d$ {"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]} $d$::jsonb,
    'medium','a1285000-0000-4000-8000-000000000001','a1285000-0000-4000-8000-000000000018'
  ) returning id
)
insert into public.approval_decisions (request_id, decision, decided_by)
select id, 'reject', 'a1285000-0000-4000-8000-000000000001'::uuid from created;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000018',
    $d$ {"title":"SAN1285 Concert","dateIso":"2030-10-20T19:00:00Z","venue":"Test Venue","ticketTiers":[{"name":"General","priceCop":40000,"quantity":30},{"name":"VIP","priceCop":80000,"quantity":10}]} $d$::jsonb,
    'san1285-rejected'
  ) $q$,
  'P0001','DECISION_CONFLICT','15f: a rejected proposal cannot be published');
reset role;
select is((select count(*)::int from public.events where slug='san1285-rejected'),
  0,'15g: rejected proposal writes no event');

-- A duplicate slug rolls back the whole transaction (approval claim included).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000020',
    '{"title":"SAN1285 Duplicate Slug","dateIso":"2030-10-21T19:00:00Z"}'::jsonb,
    'san1285-concert'
  ) $q$,
  '23505',null,'15h: duplicate slug fails the event insert');
reset role;
select is((select count(*)::int from public.approval_requests
  where proposal_id='a1285000-0000-4000-8000-000000000020'),
  0,'15i: duplicate-slug failure rolls back the approval claim');

select is((select count(*)::int from public.events where slug='foreign-host'),
  0,'15j: foreign actor writes no event');

-- Inject a failure specifically AFTER the event INSERT; the whole call must roll back.
create function pg_temp.san1285_test_tier_failure()
returns trigger language plpgsql as $$
begin
  if new.name = 'ForceFailure' then
    raise exception 'TEST_TIER_FAILURE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger san1285_force_tier_failure
before insert on public.event_tickets
for each row execute function pg_temp.san1285_test_tier_failure();

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok(
  $q$ select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000013',
    '{"title":"SAN1285 rollback","dateIso":"2030-10-20T19:00:00Z","ticketTiers":[{"name":"ForceFailure","priceCop":1000,"quantity":5}]}'::jsonb,
    'san1285-rollback'
  ) $q$,
  'P0001','TEST_TIER_FAILURE','16: deliberate after-event ticket failure propagates');
reset role;
select is((select count(*)::int from public.events where slug='san1285-rollback'),
  0,'17: no orphan published event after tier failure');
select is((select count(*)::int from public.approval_requests where proposal_id='a1285000-0000-4000-8000-000000000013'),
  0,'18: no orphan confirmation/receipt after failure');
select is((select count(*)::int from public.approval_decisions where request_id in
  (select ar.id from public.approval_requests ar where ar.proposal_id='a1285000-0000-4000-8000-000000000013')),
  0,'19: no orphan decision after failed tier insertion');

select * from finish();
rollback;
