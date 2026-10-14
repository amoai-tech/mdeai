-- SAN-486 · the apartments table cannot hold an impossible availability window or stay limit.
-- Run with: supabase test db
begin;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email)
values ('f4870000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'san486-checks-owner@example.com');
insert into public.landlord_profiles (id, user_id, display_name, verification_status, verified_at)
values ('f4870000-0000-4000-8000-000000000011', 'f4870000-0000-4000-8000-000000000001',
        'SAN486 Checks Owner', 'approved', now());

-- Draft rows (inactive/pending/draft) so no publication guard is involved.
create or replace function pg_temp.ins(p_id text, p_from date, p_to date, p_min int, p_max int)
returns void language sql as $$
  insert into public.apartments
    (id, title, slug, neighborhood, address, status, moderation_status, listing_workflow_status,
     landlord_id, verified, price_monthly, currency, available_from, available_to, minimum_stay_days, maximum_stay_days)
  values (('f4870000-0000-4000-8000-0000000000' || p_id)::uuid, 'SAN486 range ' || p_id, 'san486-range-' || p_id,
          'Laureles', 'SAN486 range address ' || p_id, 'inactive', 'pending', 'draft',
          'f4870000-0000-4000-8000-000000000011', false, 2900000, 'COP', p_from, p_to, p_min, p_max)
$$;

select has_check('public', 'apartments', 'apartments has CHECK constraints');
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.apartments'::regclass
      and conname in ('apartments_availability_window_check', 'apartments_minimum_stay_positive_check',
                      'apartments_maximum_stay_positive_check', 'apartments_stay_limits_ordered_check')
      and convalidated),
  4, 'C0: all four range constraints exist and are validated');

-- Allowed: ordinary values, equal ends, and every NULL (unknown / open-ended).
select lives_ok($$select pg_temp.ins('21', date '2026-11-01', date '2026-11-30', 30, 365)$$, 'C1: a normal window and limits are accepted');
select lives_ok($$select pg_temp.ins('22', date '2026-11-01', date '2026-11-01', 1, 1)$$, 'C2: a one-day window and equal min/max are accepted');
select lives_ok($$select pg_temp.ins('23', null, null, null, null)$$, 'C3: unknown (NULL) dates and limits are accepted');
select lives_ok($$select pg_temp.ins('24', date '2026-11-01', null, 30, null)$$, 'C4: an open-ended window is accepted');

-- Refused.
select throws_ok($$select pg_temp.ins('31', date '2026-11-30', date '2026-11-01', 30, 365)$$, '23514', null,
  'C5: a window that ends before it starts is refused');
select throws_ok($$select pg_temp.ins('32', date '2026-11-01', date '2026-11-30', 0, 365)$$, '23514', null,
  'C6: a zero-night minimum stay is refused');
select throws_ok($$select pg_temp.ins('33', date '2026-11-01', date '2026-11-30', -5, 365)$$, '23514', null,
  'C7: a negative minimum stay is refused');
select throws_ok($$select pg_temp.ins('34', date '2026-11-01', date '2026-11-30', 30, 0)$$, '23514', null,
  'C8: a zero-night maximum stay is refused');
select throws_ok($$select pg_temp.ins('35', date '2026-11-01', date '2026-11-30', 90, 30)$$, '23514', null,
  'C9: a minimum stay longer than the maximum is refused');

-- Updates are protected too.
select throws_ok($$update public.apartments set available_to = date '2026-10-01'
  where id = 'f4870000-0000-4000-8000-000000000021'$$, '23514', null,
  'C10: moving the end of an existing window before its start is refused');
select throws_ok($$update public.apartments set minimum_stay_days = 400
  where id = 'f4870000-0000-4000-8000-000000000021'$$, '23514', null,
  'C11: raising an existing minimum stay above its maximum is refused');

-- The rows that were refused left nothing behind.
select is((select count(*)::int from public.apartments where id::text like 'f4870000-%'), 4,
  'C12: only the four valid rows exist');

select * from finish();
rollback;
