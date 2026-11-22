-- SAN-1698 · viewing requests: "no such listing" is not "this listing refuses you".
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
select plan(5);

-- 1. A UUID that matches nothing is unresolvable, not unavailable.
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'ffffffff-ffff-4fff-8fff-ffffffffffff'::text, null::uuid, 'san1698-missing-key'::text,
    'form'::text, 'san1698@example.invalid'::text, 'SAN-1698'::text, null::text, null::uuid,
    '2099-06-01T15:00:00Z'::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P1288', 'p1_schedule_tour_atomic: listing not found',
  'a uuid that matches no apartment raises P1288');

-- 2. A slug that matches nothing is unresolvable too.
select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'san1698-no-such-slug'::text, null::uuid, 'san1698-missing-slug'::text,
    'form'::text, 'san1698@example.invalid'::text, 'SAN-1698'::text, null::text, null::uuid,
    '2099-06-01T15:00:00Z'::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P1288', 'p1_schedule_tour_atomic: listing not found',
  'a slug that matches no apartment raises P1288');

-- 3. An apartment that exists but is private still raises P1287: the split must not turn a
--    real refusal into "gone", which would tell the renter to refresh instead of move on.
insert into public.apartments
  (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status,
   landlord_id, available_from, available_to, metadata)
values
  ('a1690000-0000-4000-8000-000000000010', 'SAN-1698 Private', 'san1698-private', 'Laureles',
   'active', 'approved', 'published', 'a1690000-0000-4000-8000-000000000021',
   '2026-01-01', '2099-12-31', '{"visibility":"private"}'::jsonb);

select throws_ok($q$
  select public.p1_schedule_tour_atomic(
    'a1690000-0000-4000-8000-000000000010'::text, null::uuid, 'san1698-private-key'::text,
    'form'::text, 'san1698@example.invalid'::text, 'SAN-1698'::text, null::text, null::uuid,
    '2099-06-01T15:00:00Z'::timestamptz, '{}'::jsonb, '{}'::jsonb)
$q$, 'P1287', 'p1_schedule_tour_atomic: listing is not requestable',
  'an existing but non-requestable apartment keeps P1287');

-- 4. The unresolvable path leaves no lead behind.
select is(
  (select count(*)::int from public.leads where email = 'san1698@example.invalid'),
  0,
  'an unresolvable reference creates no lead'
);

-- 5. Nor a showing.
select is(
  (select count(*)::int from public.showings s
     join public.leads l on l.id = s.lead_id
    where l.email = 'san1698@example.invalid'),
  0,
  'an unresolvable reference creates no showing'
);

select * from finish();
rollback;
