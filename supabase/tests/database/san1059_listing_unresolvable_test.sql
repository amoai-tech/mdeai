-- SAN-1059 · viewing requests: "no such listing" is not "this listing refuses you".
--
-- WHY THIS FILE EXISTS
--
-- public.p1_schedule_tour_atomic raised P1287 for two different worlds:
--
--   * the reference matches no apartment at all (deleted, replaced, or a stale card), and
--   * the apartment exists but cannot take a viewing request.
--
-- The renter saw one dead-end message and the UI offered a write-retry that could never
-- succeed for the first case. This file pins the split at the SQL source:
--
--   no row for that id/slug                -> P1288 (unresolvable)
--   row exists, predicate chain rejects it -> P1287 (unavailable), unchanged
--
-- It also pins that the unresolvable path writes nothing, so a stale reference can never
-- leave a lead or a showing behind.
begin;
select plan(10);

-- 1. A UUID that matches nothing is unresolvable, not unavailable.
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::text, null::uuid, 'san1059-missing-key'::text,
    'form'::text, 'san1059@example.invalid'::text, 'SAN-1059'::text, null::text, null::uuid,
    '2099-06-01T15:00:00Z'::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P1288', 'p1_schedule_tour_atomic: listing not found',
  'a uuid that matches no apartment raises P1288');

-- 2. A slug that matches nothing is unresolvable too.
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1059-no-such-slug'::text, null::uuid, 'san1059-missing-slug'::text,
    'form'::text, 'san1059@example.invalid'::text, 'SAN-1059'::text, null::text, null::uuid,
    '2099-06-01T15:00:00Z'::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P1288', 'p1_schedule_tour_atomic: listing not found',
  'a slug that matches no apartment raises P1288');

-- 3–4. Private/internal identifiers are indistinguishable from unknown references.
-- A security-definer RPC must not expose the existence of private inventory.
insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, available_from, available_to, metadata)
values
  ('a1690000-0000-4000-8000-000000000010', 'SAN-1059 Private', 'san1059-private', 'Laureles',
   'active', 'approved', 'published', null,
   '2026-01-01', '2099-12-31', '{"visibility":"private"}'::jsonb);

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'a1690000-0000-4000-8000-000000000010'::text, null::uuid, 'san1059-private-id'::text,
    'form'::text, 'san1059@example.invalid'::text, 'SAN-1059'::text, null::text, null::uuid,
    '2099-06-01T15:00:00Z'::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P1288', 'p1_schedule_tour_atomic: listing not found',
  'private apartment id is indistinguishable from a missing id');

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1059-private'::text, null::uuid, 'san1059-private-slug'::text,
    'form'::text, 'san1059@example.invalid'::text, 'SAN-1059'::text, null::text, null::uuid,
    '2099-06-01T15:00:00Z'::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P1288', 'p1_schedule_tour_atomic: listing not found',
  'private apartment slug is indistinguishable from a missing slug');

-- 5. A visible existing row rejected by Phase B keeps P1287. Switch the
-- transaction-local runtime setting only; the outer rollback restores Phase A.
insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, available_from, available_to, metadata)
values
  ('a1690000-0000-4000-8000-000000000011', 'SAN-1059 Inactive', 'san1059-inactive',
   'Laureles', 'inactive', 'pending', 'draft', null,
   '2026-01-01', '2099-12-31', '{}'::jsonb);
update public.rental_runtime_settings set phase = 'launch' where singleton;
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1059-inactive'::text, null::uuid, 'san1059-inactive-key'::text,
    'form'::text, 'san1059@example.invalid'::text, 'SAN-1059'::text, null::text, null::uuid,
    '2099-06-01T15:00:00Z'::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P1287', 'p1_schedule_tour_atomic: listing is not requestable',
  'an existing visible but unrequestable row still raises P1287');
update public.rental_runtime_settings set phase = 'development' where singleton;

-- 6. None of the rejected paths leaves a lead behind.
select is(
  (select count(*)::int from public.leads where email = 'san1059@example.invalid'),
  0,
  'an unresolvable reference creates no lead'
);

-- 7. Nor a showing.
select is(
  (select count(*)::int from public.showings s
     join public.leads l on l.id = s.lead_id
    where l.email = 'san1059@example.invalid'),
  0,
  'an unresolvable reference creates no showing'
);

-- 8–10. The SECURITY DEFINER RPC must never accept direct guest/user calls.
select is(has_function_privilege('anon',
  'public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamptz,jsonb,jsonb)',
  'execute'), false, 'anon cannot call the server-only viewing writer');
select is(has_function_privilege('authenticated',
  'public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamptz,jsonb,jsonb)',
  'execute'), false, 'authenticated cannot call the server-only viewing writer');
select is(has_function_privilege('service_role',
  'public.p1_schedule_tour_atomic(text,uuid,text,text,text,text,text,uuid,timestamptz,jsonb,jsonb)',
  'execute'), true, 'authorized server role can invoke the writer');

select * from finish();
rollback;
