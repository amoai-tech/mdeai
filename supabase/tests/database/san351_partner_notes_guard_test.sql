-- SAN-351 · Broker-only partner_notes cannot be written by the renter who owns the booking.
--
-- The BEFORE INSERT branch of guard_apartment_booking_payment_authority already refused a
-- client-supplied partner_notes, but the UPDATE branch only guarded partner_id. A renter could
-- therefore overwrite the broker's private notes after the booking existed.
--
-- Reproduced on the live database before this fix: a session running as `authenticated` with
-- the booking owner's sub updated partner_notes to 'RENTER WROTE THIS' and the row kept it.
-- After the migration the same statement raises 23514.
--
-- The approval columns (partner_status / approved_by / approved_at) are NOT part of this guard:
-- they are already rejected by guard_booking_partner_decision(), which was also verified by
-- attempting a renter self-approval.
--
-- Run with: supabase test db

begin;

select plan(4);

-- Fixture: one real profile and one pending apartment booking owned by that profile.
insert into auth.users (id, email, email_confirmed_at)
values ('a3510000-0000-4000-8000-000000000001', 'san351-owner@example.test', now())
on conflict (id) do nothing;

insert into public.profiles (id, email, role)
values ('a3510000-0000-4000-8000-000000000001', 'san351-owner@example.test', 'user')
on conflict (id) do nothing;

insert into public.bookings (
  id, user_id, booking_type, resource_id, resource_title, status, start_date, partner_status
) values (
  'b3510000-0000-4000-8000-000000000001',
  'a3510000-0000-4000-8000-000000000001',
  'apartment',
  'c3510000-0000-4000-8000-000000000001',
  'SAN-351 fixture apartment',
  'pending',
  '2026-12-01',
  'pending'
);

-- 1. The renter who owns the booking still cannot touch broker-only notes.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3510000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$ update public.bookings
        set partner_notes = 'RENTER WROTE THIS'
      where id = 'b3510000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'a renter cannot overwrite the broker-only partner_notes'
);

-- 2. The pre-existing renter cancellation path must still work.
select lives_ok(
  $$ update public.bookings
        set status = 'cancelled'
      where id = 'b3510000-0000-4000-8000-000000000001' $$,
  'a renter can still cancel their own pending apartment booking'
);
reset role;

-- 3. A trusted server role can still write the notes.
set local role service_role;
select lives_ok(
  $$ update public.bookings
        set partner_notes = 'BROKER NOTE OK'
      where id = 'b3510000-0000-4000-8000-000000000001' $$,
  'the trusted service role can still write partner_notes'
);
reset role;

-- 4. And the write actually persisted for the trusted actor.
select is(
  (select partner_notes from public.bookings where id = 'b3510000-0000-4000-8000-000000000001'),
  'BROKER NOTE OK',
  'the trusted write is the value stored on the row'
);

select * from finish();
rollback;
