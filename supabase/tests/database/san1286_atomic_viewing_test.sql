-- SAN-1286 · Atomic rental viewing mutation
-- Proves one service-owned RPC commits lead + showing together, preserves the
-- full rental contract, and is idempotent for authenticated and guest callers.

begin;
select plan(60);

-- Deterministic fixtures; transaction rollback keeps the local DB clean.
insert into public.profiles (id, email, full_name)
values
  ('a2860000-0000-4000-8000-000000000001', 'san1286-renter@example.com', 'SAN 1286 Renter'),
  ('a2860000-0000-4000-8000-000000000003', 'san1286-other@example.com', 'SAN 1286 Other');

insert into public.trips (id, user_id, title, start_date, end_date)
values
  (
    'a2860000-0000-4000-8000-000000000002',
    'a2860000-0000-4000-8000-000000000001',
    'SAN-1286 trip',
    '2099-10-01',
    '2099-10-31'
  ),
  (
    'a2860000-0000-4000-8000-000000000005',
    'a2860000-0000-4000-8000-000000000001',
    'SAN-1286 second renter trip',
    '2099-10-01',
    '2099-10-31'
  ),
  (
    'a2860000-0000-4000-8000-000000000004',
    'a2860000-0000-4000-8000-000000000003',
    'SAN-1286 other trip',
    '2099-10-01',
    '2099-10-31'
  );

insert into public.apartments (id, title, slug, neighborhood, status, available_to)
values
  ('a2860000-0000-4000-8000-000000000010', 'SAN-1286 Active', 'san1286-active', 'Laureles', 'active', '2099-12-31'),
  ('a2860000-0000-4000-8000-000000000011', 'SAN-1286 Inactive', 'san1286-inactive', 'Laureles', 'inactive', '2099-12-31'),
  ('a2860000-0000-4000-8000-000000000012', 'SAN-1286 Other', 'san1286-other', 'Laureles', 'active', '2099-12-31');

-- Contract / ACL / index shape.
select ok(
  to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)') is not null,
  'new p1_schedule_tour_atomic signature exists'
);
select ok(
  to_regprocedure('public.p1_schedule_tour_atomic(uuid,text,uuid,text,text,text,text,jsonb,uuid,timestamp with time zone,text,jsonb)') is null,
  'old overloaded signature is retired'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='idx_leads_guest_idempotency_unique'),
  'guest idempotency unique index exists'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='idx_showings_lead_apt_day'),
  'showing same-day guard index exists'
);
select is(
  has_function_privilege('anon', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'),
  false,
  'anon cannot execute privileged viewing RPC'
);
select is(
  has_function_privilege('authenticated', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'),
  false,
  'authenticated cannot execute privileged viewing RPC directly'
);
select is(
  has_function_privilege('service_role', to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)'), 'EXECUTE'),
  true,
  'service_role can execute privileged viewing RPC'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)')),
  true,
  'viewing RPC remains SECURITY DEFINER'
);
select is(
  (select p.proconfig::text from pg_proc p where p.oid = to_regprocedure('public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamp with time zone,jsonb,jsonb)')),
  '{"search_path=\"\""}',
  'viewing RPC pins an empty search_path'
);

-- Prove the service role can enter the service-only SECURITY DEFINER contract.
set local role service_role;
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active', null::uuid, 'san1286-service-key-001', 'form',
    'service-role@example.com', 'Service Role', null, null::uuid,
    '2099-10-14 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'service_role executes SECURITY DEFINER viewing RPC');
reset role;
select is((select count(*)::int from public.leads where idempotency_key='san1286-service-key-001'), 1, 'service_role RPC creates one lead');
select is((select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-service-key-001'), 1, 'service_role RPC creates one showing');

-- Authenticated request: one committed pair with the full rental contract.
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    '  san1286-active  ',
    'a2860000-0000-4000-8000-000000000001'::uuid,
    'san1286-auth-key-001',
    'form',
    'camila@example.com',
    'Camila',
    '+573001234567',
    'a2860000-0000-4000-8000-000000000002'::uuid,
    '2099-10-15 14:00:00+00'::timestamptz,
    '{"case":"auth"}'::jsonb,
    '{"case":"auth"}'::jsonb
  )
$q$, 'authenticated request commits');

select is((select count(*)::int from public.leads where idempotency_key='san1286-auth-key-001'), 1, 'authenticated request creates one lead');
select is((select apartment_id from public.leads where idempotency_key='san1286-auth-key-001'), 'a2860000-0000-4000-8000-000000000010'::uuid, 'lead points to requested apartment');
select is((select intent from public.leads where idempotency_key='san1286-auth-key-001'), 'rental', 'lead intent is rental');
select is((select preferred_showing_at from public.leads where idempotency_key='san1286-auth-key-001'), '2099-10-15 14:00:00+00'::timestamptz, 'lead stores canonical viewing time');
select is((select name from public.leads where idempotency_key='san1286-auth-key-001'), 'Camila', 'lead stores renter name');
select is((select trip_id from public.leads where idempotency_key='san1286-auth-key-001'), 'a2860000-0000-4000-8000-000000000002'::uuid, 'lead stores trip id');
select is((select pipeline_stage from public.leads where idempotency_key='san1286-auth-key-001'), 'showing_scheduled', 'lead enters showing_scheduled pipeline stage');
select is((select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-auth-key-001'), 1, 'authenticated request creates one showing');
select is((select s.trip_id from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-auth-key-001'), 'a2860000-0000-4000-8000-000000000002'::uuid, 'showing stores trip id');
select is((select metadata->>'listing_id' from public.leads where idempotency_key='san1286-auth-key-001'), 'san1286-active', 'lead stores normalized original listing identifier');

-- Replay must return the existing logical pair.
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active',
    'a2860000-0000-4000-8000-000000000001'::uuid,
    'san1286-auth-key-001',
    'form',
    'camila@example.com',
    'Camila',
    '+573001234567',
    'a2860000-0000-4000-8000-000000000002'::uuid,
    '2099-10-15 14:00:00+00'::timestamptz,
    '{"case":"auth-replay"}'::jsonb,
    '{"case":"auth-replay"}'::jsonb
  )
$q$, 'authenticated replay succeeds');
select is((select count(*)::int from public.leads where idempotency_key='san1286-auth-key-001'), 1, 'authenticated replay keeps one lead');
select is((select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-auth-key-001'), 1, 'authenticated replay keeps one showing');

-- A committed replay must use the preserved request identity, not the apartment's
-- current slug. Renaming a slug after commit must not invalidate the original retry.
update public.apartments set slug='san1286-active-renamed' where id='a2860000-0000-4000-8000-000000000010'::uuid;
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active',
    'a2860000-0000-4000-8000-000000000001'::uuid,
    'san1286-auth-key-001', 'form', 'camila@example.com', 'Camila', '+573001234567',
    'a2860000-0000-4000-8000-000000000002'::uuid,
    '2099-10-15 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'committed replay survives apartment slug rename');
update public.apartments set slug='san1286-active' where id='a2860000-0000-4000-8000-000000000010'::uuid;

select throws_ok($q$
  update public.leads
  set metadata = jsonb_set(metadata, '{listing_id}', '"tampered-listing"'::jsonb)
  where idempotency_key='san1286-auth-key-001'
$q$, 'P1286', 'SAN-1286 viewing request identity is immutable', 'committed listing identity cannot be changed');
select throws_ok($q$
  update public.leads
  set intent = 'buyer'
  where idempotency_key='san1286-auth-key-001'
$q$, 'P1286', 'SAN-1286 viewing request identity is immutable', 'viewing intent cannot be changed to bypass identity protection');
select throws_ok($q$
  update public.leads
  set idempotency_key = 'san1286-auth-key-bypassed'
  where idempotency_key='san1286-auth-key-001'
$q$, 'P1286', 'SAN-1286 viewing request identity is immutable', 'viewing idempotency key cannot be changed to bypass identity protection');

select ok(
  (select metadata ? 'schedule_viewing_identity' from public.leads where idempotency_key='san1286-auth-key-001'),
  'committed lead stores an immutable full viewing request identity snapshot'
);
select throws_ok($q$
  update public.leads
  set metadata = jsonb_set(metadata, '{schedule_viewing_identity,scheduled_at}', '"2099-10-22T14:00:00+00:00"'::jsonb)
  where idempotency_key='san1286-auth-key-001'
$q$, 'P1286', 'SAN-1286 viewing request identity is immutable', 'viewing request identity snapshot cannot be changed directly');

-- Authenticated owners may edit normal lead fields later, but those mutable CRM
-- values must never redefine the original idempotent viewing request.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2860000-0000-4000-8000-000000000001', true);
select lives_ok($q$
  update public.leads
  set preferred_showing_at = '2099-10-22 14:00:00+00'::timestamptz,
      trip_id = 'a2860000-0000-4000-8000-000000000005'::uuid,
      email = 'changed@example.com',
      name = 'Changed Camila',
      phone = '+573009999999'
  where idempotency_key='san1286-auth-key-001'
$q$, 'authenticated owner can still update mutable CRM lead fields');
reset role;

select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active',
    'a2860000-0000-4000-8000-000000000001'::uuid,
    'san1286-auth-key-001', 'form', 'camila@example.com', 'Camila', '+573001234567',
    'a2860000-0000-4000-8000-000000000002'::uuid,
    '2099-10-15 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'original committed request still replays after mutable lead edits');
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active',
    'a2860000-0000-4000-8000-000000000001'::uuid,
    'san1286-auth-key-001', 'form', 'changed@example.com', 'Changed Camila', '+573009999999',
    'a2860000-0000-4000-8000-000000000005'::uuid,
    '2099-10-22 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: idempotency key reused for different viewing request', 'mutable lead edits cannot redefine the idempotency identity');
select is(
  (select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-auth-key-001'),
  1,
  'mutable lead edits plus replay still keep exactly one showing'
);

-- A completed request must remain idempotent even after its requested time passes.
-- This models a lost response retried later: the existing committed pair wins over
-- new-request future-time validation.
insert into public.leads (
  user_id, source, email, name, apartment_id, preferred_showing_at, intent, status,
  pipeline_stage, metadata, idempotency_key
) values (
  null, 'form', 'past-replay@example.com', 'Past Replay',
  'a2860000-0000-4000-8000-000000000010'::uuid,
  '2026-01-15 14:00:00+00'::timestamptz, 'rental', 'new', 'showing_scheduled',
  '{
    "listing_id":"san1286-active",
    "schedule_viewing_identity":{
      "user_id":null,
      "listing_id":"san1286-active",
      "apartment_id":"a2860000-0000-4000-8000-000000000010",
      "scheduled_at":"2026-01-15T14:00:00+00:00",
      "trip_id":null,
      "email":"past-replay@example.com",
      "name":"past replay",
      "phone":null
    }
  }'::jsonb,
  'san1286-past-replay-key'
);
insert into public.showings (lead_id, apartment_id, scheduled_at, status, metadata)
select id, apartment_id, preferred_showing_at, 'scheduled', '{}'::jsonb
from public.leads where idempotency_key='san1286-past-replay-key';

select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active', null::uuid, 'san1286-past-replay-key', 'form',
    'past-replay@example.com', 'Past Replay', null, null::uuid,
    '2026-01-15 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'past committed request replays after its scheduled time');
select is((select count(*)::int from public.leads where idempotency_key='san1286-past-replay-key'), 1, 'past replay keeps one lead');
select is((select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-past-replay-key'), 1, 'past replay keeps one showing');

-- Reusing the same idempotency key for a different request must fail closed.
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-other',
    'a2860000-0000-4000-8000-000000000001'::uuid,
    'san1286-auth-key-001', 'form', 'camila@example.com', 'Camila', '+573001234567',
    'a2860000-0000-4000-8000-000000000002'::uuid,
    '2099-10-15 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: idempotency key reused for different viewing request', 'same key with different apartment is rejected');
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active',
    'a2860000-0000-4000-8000-000000000001'::uuid,
    'san1286-auth-key-001', 'form', 'camila@example.com', 'Camila', '+573001234567',
    'a2860000-0000-4000-8000-000000000002'::uuid,
    '2099-10-15 16:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: idempotency key reused for different viewing request', 'same key with different time is rejected');
select is((select count(*)::int from public.leads where idempotency_key='san1286-auth-key-001'), 1, 'mismatched replays do not create another lead');
select is((select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-auth-key-001'), 1, 'mismatched replays do not create another showing');

-- Trip linkage is trusted only when the trip belongs to the authenticated renter.
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active',
    'a2860000-0000-4000-8000-000000000001'::uuid,
    'san1286-wrong-trip-key', 'form', 'camila@example.com', 'Camila', null,
    'a2860000-0000-4000-8000-000000000004'::uuid,
    '2099-10-16 12:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: trip does not belong to user', 'another user trip is rejected');
select is((select count(*)::int from public.leads where idempotency_key='san1286-wrong-trip-key'), 0, 'wrong-trip request creates no lead');
select is((select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-wrong-trip-key'), 0, 'wrong-trip request creates no showing');

-- Guest request: email + idempotency key is the DB-enforced guest scope.
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active',
    null::uuid,
    'san1286-guest-key-001',
    'form',
    ' Guest.Camila@Example.com ',
    'Guest Camila',
    null,
    null::uuid,
    '2099-10-16 14:00:00+00'::timestamptz,
    '{"case":"guest"}'::jsonb,
    '{"case":"guest"}'::jsonb
  )
$q$, 'guest request commits');
select lives_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active',
    null::uuid,
    'san1286-guest-key-001',
    'form',
    'guest.camila@example.com',
    'Guest Camila',
    null,
    null::uuid,
    '2099-10-16 14:00:00+00'::timestamptz,
    '{"case":"guest-replay"}'::jsonb,
    '{"case":"guest-replay"}'::jsonb
  )
$q$, 'guest replay succeeds');
select is((select count(*)::int from public.leads where user_id is null and idempotency_key='san1286-guest-key-001'), 1, 'guest replay keeps one lead');
select is((select lower(email) from public.leads where user_id is null and idempotency_key='san1286-guest-key-001'), 'guest.camila@example.com', 'guest email is normalized');
select is((select apartment_id from public.leads where user_id is null and idempotency_key='san1286-guest-key-001'), 'a2860000-0000-4000-8000-000000000010'::uuid, 'guest lead points to requested apartment');
select is((select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-guest-key-001'), 1, 'guest replay keeps one showing');
select throws_ok($q$
  insert into public.showings (lead_id, apartment_id, scheduled_at, status, metadata)
  select l.id, l.apartment_id, '2099-10-16 17:00:00+00'::timestamptz, 'scheduled', '{}'::jsonb
  from public.leads l where l.idempotency_key='san1286-guest-key-001'
$q$, '23505', null, 'same lead/apartment cannot get a second showing on the same Bogota day');

-- Non-requestable listing must fail before any mutation.
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-inactive', null::uuid, 'san1286-inactive-key', 'form',
    'inactive@example.com', 'Inactive', null, null::uuid,
    '2099-10-17 14:00:00+00'::timestamptz, '{}'::jsonb, '{}'::jsonb
  )
$q$, 'P0001', 'p1_schedule_tour_atomic: listing is not requestable', 'inactive listing is rejected');
select is((select count(*)::int from public.leads where idempotency_key='san1286-inactive-key'), 0, 'inactive listing creates no lead');

-- Force a downstream showing failure. The lead insert must roll back too.
create or replace function public.san1286_test_fail_showing()
returns trigger language plpgsql as $$
begin
  if new.metadata->>'force_fail' = 'true' then
    raise exception 'forced showing failure' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger san1286_test_fail_showing
before insert on public.showings
for each row execute function public.san1286_test_fail_showing();

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active', null::uuid, 'san1286-rollback-key', 'form',
    'rollback@example.com', 'Rollback', null, null::uuid,
    '2099-10-18 14:00:00+00'::timestamptz,
    '{"case":"rollback"}'::jsonb,
    '{"force_fail":"true"}'::jsonb
  )
$q$, 'P0001', 'forced showing failure', 'showing failure propagates');
select is((select count(*)::int from public.leads where idempotency_key='san1286-rollback-key'), 0, 'showing failure rolls back lead');
select is((select count(*)::int from public.showings s join public.leads l on l.id=s.lead_id where l.idempotency_key='san1286-rollback-key'), 0, 'showing failure leaves no showing');

-- The RPC may suppress only the intentional same-day arbiter conflict. An
-- unrelated future unique constraint must propagate instead of being swallowed.
create unique index san1286_test_showings_external_unique
  on public.showings ((metadata->>'external_unique'))
  where metadata ? 'external_unique';
update public.showings
set metadata = metadata || '{"external_unique":"collision"}'::jsonb
where id = (
  select s.id
  from public.showings s
  join public.leads l on l.id=s.lead_id
  where l.idempotency_key='san1286-service-key-001'
  limit 1
);

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1286-active', null::uuid, 'san1286-unrelated-unique-key', 'form',
    'unique@example.com', 'Unique Conflict', null, null::uuid,
    '2099-10-19 14:00:00+00'::timestamptz, '{}'::jsonb,
    '{"external_unique":"collision"}'::jsonb
  )
$q$, '23505', null, 'unrelated showing unique violation propagates');
select is((select count(*)::int from public.leads where idempotency_key='san1286-unrelated-unique-key'), 0, 'unrelated showing unique violation rolls back lead');

select * from finish();
rollback;
