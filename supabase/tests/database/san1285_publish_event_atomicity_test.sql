-- SAN-1285 · atomic, idempotent host-event publish.
--
-- Proves the single `public.publish_event_tx` transaction:
--   * one approved publish writes exactly one event + its ticket tiers + decision
--     + durable receipt;
--   * a retry (even with a new slug) returns the same event and writes nothing;
--   * a changed draft or a foreign actor is refused with zero mutations;
--   * a failure after the event insert (bad tier / duplicate slug) rolls back the
--     approval claim, decision, event and tiers together;
--   * anon cannot execute the definer function.
--
-- Fixtures are created inside this transaction and rolled back at the end.

begin;
select plan(32);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('a1285000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1285-host@example.com'),
  ('a1285000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'san1285-outsider@example.com');

-- Supabase's auth.users trigger may already create the profile row; upsert so the
-- fixture is deterministic whether or not the trigger is present.
insert into public.profiles (id, email, full_name, avatar_url)
values
  ('a1285000-0000-4000-8000-000000000001', 'san1285-host@example.com',
   'SAN 1285 Host', 'https://example.com/san1285-host.png'),
  ('a1285000-0000-4000-8000-000000000002', 'san1285-outsider@example.com',
   'SAN 1285 Outsider', null)
on conflict (id) do update
  set full_name = excluded.full_name,
      avatar_url = excluded.avatar_url;

-- ---------------------------------------------------------------------------
-- ACL: the definer function is callable by a signed-in user, never by anon.
-- ---------------------------------------------------------------------------
select is(
  has_function_privilege('anon', 'public.publish_event_tx(text,jsonb,jsonb)', 'execute'),
  false,
  'anon cannot execute the publish transaction'
);
select is(
  has_function_privilege('authenticated', 'public.publish_event_tx(text,jsonb,jsonb)', 'execute'),
  true,
  'authenticated hosts can execute the publish transaction'
);
select is(
  (select prosecdef from pg_proc
    where oid = 'public.publish_event_tx(text,jsonb,jsonb)'::regprocedure),
  true,
  'publish transaction is SECURITY DEFINER (callers cannot write approval tables)'
);

create temp table san1285_result (receipt jsonb);
create temp table san1285_retry (receipt jsonb);
grant insert, select on san1285_result to authenticated;
grant insert, select on san1285_retry to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into san1285_result
select public.publish_event_tx(
  'a1285000-0000-4000-8000-000000000010',
  $draft${
    "title": "SAN-1285 Atomic Event",
    "neighborhood": "Laureles",
    "dateIso": "2099-05-01T20:00:00-05:00",
    "venue": "Son Havana",
    "priceMinCop": 50000,
    "capacity": 80,
    "description": "Atomic publish fixture",
    "ticketTiers": []
  }$draft$::jsonb,
  $event${
    "source": "host_wizard",
    "name": "SAN-1285 Atomic Event",
    "description": "Atomic publish fixture",
    "address": "Son Havana",
    "city": "Medellín",
    "country": "CO",
    "event_start_time": "2099-05-02T01:00:00Z",
    "ticket_price_min": 50000,
    "currency": "cop",
    "slug": "san1285-atomic-event",
    "status": "published",
    "organizer_id": "a1285000-0000-4000-8000-000000000001",
    "created_by": "a1285000-0000-4000-8000-000000000001",
    "details": {"neighborhood": "Laureles", "capacity": 80, "ticket_tiers": []}
  }$event$::jsonb
);

reset role;

select is(
  (select receipt ->> 'eventId' is not null from san1285_result),
  true,
  'first approved publish returns a durable event id'
);
select is(
  (select receipt ->> 'slug' from san1285_result),
  'san1285-atomic-event',
  'receipt returns the persisted slug'
);
select is(
  (select count(*)::int from public.events where slug = 'san1285-atomic-event'),
  1,
  'approved publish writes exactly one event'
);
select is(
  (select count(*)::int from public.event_tickets t
     join public.events e on e.id = t.event_id
    where e.slug = 'san1285-atomic-event'),
  1,
  'an empty priced draft gets exactly one General Admission tier'
);
select is(
  (select t.qty_total from public.event_tickets t
     join public.events e on e.id = t.event_id
    where e.slug = 'san1285-atomic-event'),
  80,
  'fallback tier quantity is the draft capacity'
);
select is(
  (select t.price_cents from public.event_tickets t
     join public.events e on e.id = t.event_id
    where e.slug = 'san1285-atomic-event'),
  50000,
  'tier price is the reviewed draft price'
);
select is(
  (select status from public.approval_requests
    where proposal_id = 'a1285000-0000-4000-8000-000000000010'),
  'approved',
  'approval request is committed as approved in the same transaction'
);
select is(
  (select decided_at is not null from public.approval_requests
    where proposal_id = 'a1285000-0000-4000-8000-000000000010'),
  true,
  'approval decision timestamp is committed'
);
select is(
  (select notes like 'MDE_RECEIPT:%' from public.approval_requests
    where proposal_id = 'a1285000-0000-4000-8000-000000000010'),
  true,
  'durable receipt is stored on the approval row'
);
select is(
  (select organizer_id from public.events where slug = 'san1285-atomic-event'),
  'a1285000-0000-4000-8000-000000000001'::uuid,
  'event is owned by the authenticated actor'
);
select is(
  (select created_by from public.events where slug = 'san1285-atomic-event'),
  'a1285000-0000-4000-8000-000000000001'::uuid,
  'creator is the authenticated actor'
);
select is(
  (select status || '/' || source from public.events where slug = 'san1285-atomic-event'),
  'published/host_wizard',
  'published state and source are forced by the server'
);
select is(
  (select details #>> '{host_display,name}' from public.events
    where slug = 'san1285-atomic-event'),
  'SAN 1285 Host',
  'host_display is snapshotted from the profile, not trusted from the payload'
);

-- ---------------------------------------------------------------------------
-- Retry: same proposal, same draft, a NEW slug (the edge re-slugifies each
-- attempt). It must return the original event and write nothing.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into san1285_retry
select public.publish_event_tx(
  'a1285000-0000-4000-8000-000000000010',
  $draft${
    "title": "SAN-1285 Atomic Event",
    "neighborhood": "Laureles",
    "dateIso": "2099-05-01T20:00:00-05:00",
    "venue": "Son Havana",
    "priceMinCop": 50000,
    "capacity": 80,
    "description": "Atomic publish fixture",
    "ticketTiers": []
  }$draft$::jsonb,
  $event${
    "source": "host_wizard",
    "name": "SAN-1285 Atomic Event",
    "description": "Atomic publish fixture",
    "address": "Son Havana",
    "city": "Medellín",
    "country": "CO",
    "event_start_time": "2099-05-02T01:00:00Z",
    "ticket_price_min": 50000,
    "currency": "cop",
    "slug": "san1285-atomic-event-retry",
    "status": "published",
    "organizer_id": "a1285000-0000-4000-8000-000000000001",
    "created_by": "a1285000-0000-4000-8000-000000000001",
    "details": {"neighborhood": "Laureles", "capacity": 80, "ticket_tiers": []}
  }$event$::jsonb
);

reset role;

select is(
  (select receipt ->> 'eventId' from san1285_retry),
  (select receipt ->> 'eventId' from san1285_result),
  'retry returns the original event id'
);
select is(
  (select count(*)::int from public.events
    where slug in ('san1285-atomic-event', 'san1285-atomic-event-retry')),
  1,
  'retry does not create a second event'
);
select is(
  (select count(*)::int from public.event_tickets t
     join public.events e on e.id = t.event_id
    where e.slug = 'san1285-atomic-event'),
  1,
  'retry does not duplicate ticket tiers'
);

-- A malformed legacy receipt must not block the retry or publish a second event:
-- the function skips the bad receipt and recovers the event linked by approval.
update public.approval_requests
set notes = 'MDE_RECEIPT:{"eventId":"not-a-uuid","slug":"broken"}'
where proposal_id = 'a1285000-0000-4000-8000-000000000010';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(
  (public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000010',
    $draft${
      "title": "SAN-1285 Atomic Event",
      "neighborhood": "Laureles",
      "dateIso": "2099-05-01T20:00:00-05:00",
      "venue": "Son Havana",
      "priceMinCop": 50000,
      "capacity": 80,
      "description": "Atomic publish fixture",
      "ticketTiers": []
    }$draft$::jsonb,
    $event${
      "source": "host_wizard",
      "name": "SAN-1285 Atomic Event",
      "description": "Atomic publish fixture",
      "address": "Son Havana",
      "city": "Medellín",
      "country": "CO",
      "event_start_time": "2099-05-02T01:00:00Z",
      "ticket_price_min": 50000,
      "currency": "cop",
      "slug": "san1285-atomic-event",
      "status": "published",
      "organizer_id": "a1285000-0000-4000-8000-000000000001",
      "created_by": "a1285000-0000-4000-8000-000000000001",
      "details": {"neighborhood": "Laureles", "capacity": 80, "ticket_tiers": []}
    }$event$::jsonb
  ) ->> 'eventId')::uuid,
  (select (receipt ->> 'eventId')::uuid from san1285_result),
  'a malformed legacy receipt recovers the linked event instead of duplicating'
);

reset role;

-- ---------------------------------------------------------------------------
-- A changed draft after review must be refused with zero writes.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $q$select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000010',
    '{"title":"SAN-1285 CHANGED","neighborhood":"Laureles","dateIso":"2099-05-01T20:00:00-05:00","venue":"Son Havana","priceMinCop":50000,"capacity":80,"description":"Changed after review","ticketTiers":[]}'::jsonb,
    '{"name":"SAN-1285 CHANGED","description":"Changed after review","address":"Son Havana","city":"Medellín","country":"CO","event_start_time":"2099-05-02T01:00:00Z","ticket_price_min":50000,"currency":"cop","slug":"san1285-changed","details":{}}'::jsonb
  )$q$,
  'P0001',
  'DRAFT_CHANGED',
  'a draft changed after review is refused'
);

reset role;

select is(
  (select count(*)::int from public.events where slug = 'san1285-changed'),
  0,
  'stale draft writes no event'
);
select is(
  (select count(*)::int from public.approval_requests
    where proposal_id = 'a1285000-0000-4000-8000-000000000010'),
  1,
  'stale draft does not create a second approval'
);

-- ---------------------------------------------------------------------------
-- Another authenticated user cannot publish (or hijack) the host's proposal.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1285000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $q$select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000010',
    '{"title":"SAN-1285 Atomic Event","neighborhood":"Laureles","dateIso":"2099-05-01T20:00:00-05:00","venue":"Son Havana","priceMinCop":50000,"capacity":80,"description":"Atomic publish fixture","ticketTiers":[]}'::jsonb,
    '{"name":"SAN-1285 Atomic Event","description":"Atomic publish fixture","address":"Son Havana","city":"Medellín","country":"CO","event_start_time":"2099-05-02T01:00:00Z","ticket_price_min":50000,"currency":"cop","slug":"san1285-outsider","details":{}}'::jsonb
  )$q$,
  '42501',
  'FOREIGN_PROPOSAL',
  'a different user cannot publish the host proposal'
);

reset role;

select is(
  (select count(*)::int from public.events where slug = 'san1285-outsider'),
  0,
  'foreign actor writes no event'
);
select is(
  (select count(*)::int from public.approval_requests
    where proposal_id = 'a1285000-0000-4000-8000-000000000010'),
  1,
  'foreign actor does not mutate the host approval'
);

-- ---------------------------------------------------------------------------
-- Failure after the approval claim: a duplicate slug rolls the whole
-- transaction back, including the approval request.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $q$select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000020',
    '{"title":"SAN-1285 Duplicate Slug","neighborhood":"Laureles","dateIso":"2099-06-01T20:00:00-05:00","venue":"Son Havana","priceMinCop":10000,"capacity":10,"description":"Duplicate slug","ticketTiers":[]}'::jsonb,
    '{"name":"SAN-1285 Duplicate Slug","description":"Duplicate slug","address":"Son Havana","city":"Medellín","country":"CO","event_start_time":"2099-06-02T01:00:00Z","ticket_price_min":10000,"currency":"cop","slug":"san1285-atomic-event","details":{}}'::jsonb
  )$q$,
  '23505',
  null,
  'a duplicate slug fails the event insert'
);

reset role;

select is(
  (select count(*)::int from public.approval_requests
    where proposal_id = 'a1285000-0000-4000-8000-000000000020'),
  0,
  'duplicate-slug failure rolls back the approval claim'
);

-- ---------------------------------------------------------------------------
-- Failure after the event insert: a tier quantity that overflows int rolls the
-- event back too. This is the half-publish regression guard.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1285000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $q$select public.publish_event_tx(
    'a1285000-0000-4000-8000-000000000030',
    '{"title":"SAN-1285 Tier Failure","neighborhood":"Laureles","dateIso":"2099-07-01T20:00:00-05:00","venue":"Son Havana","priceMinCop":10000,"capacity":10,"description":"Tier failure","ticketTiers":[{"name":"Broken","priceCop":10000,"quantity":100000000000000000000}]}'::jsonb,
    '{"name":"SAN-1285 Tier Failure","description":"Tier failure","address":"Son Havana","city":"Medellín","country":"CO","event_start_time":"2099-07-02T01:00:00Z","ticket_price_min":10000,"currency":"cop","slug":"san1285-tier-fail","details":{}}'::jsonb
  )$q$,
  '22003',
  null,
  'a failing ticket insert aborts the publish'
);

reset role;

select is(
  (select count(*)::int from public.events where slug = 'san1285-tier-fail'),
  0,
  'tier failure leaves no published event'
);
select is(
  (select count(*)::int from public.approval_requests
    where proposal_id = 'a1285000-0000-4000-8000-000000000030'),
  0,
  'tier failure rolls back the approval claim and decision'
);

-- ---------------------------------------------------------------------------
-- Anon cannot execute the function at all.
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $q$select public.publish_event_tx('a1285000-0000-4000-8000-000000000040', '{}'::jsonb, '{}'::jsonb)$q$,
  '42501',
  null,
  'anon is refused by the function ACL'
);
reset role;

select * from finish();
rollback;
