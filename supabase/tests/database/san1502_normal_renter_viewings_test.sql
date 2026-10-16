-- SAN-1502: real normal booking works before external approval paperwork.
-- This test is rollback-only; no rows remain after pgTAP completes.
begin;
select plan(12);

insert into auth.users (id,instance_id,aud,role,email)
values
 ('f1505000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin-san1502-booking@example.com'),
 ('f1505000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','renter-san1502-booking@example.com'),
 ('f1505000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ordinary-san1502-booking@example.com');
insert into public.user_roles(user_id,role)
values ('f1505000-0000-4000-8000-000000000001','admin');
insert into public.landlord_profiles(id,user_id,display_name)
values ('f1505000-0000-4000-8000-000000000011',
        'f1505000-0000-4000-8000-000000000001','SAN1502 Booking Owner');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1505000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('mde.san1502_booking_fixture',
  (public.admin_create_test_rental('Booking development listing','Laureles',
     'Calle 1',2400000,'COP',(now() at time zone 'America/Bogota')::date+4,
     'https://example.com/dev-listing.jpg')).id::text,true);
select lives_ok(
 $q$select public.admin_grant_rental_test_access('f1505000-0000-4000-8000-000000000002','renter')$q$,
 'administrator can grant the renter access');
reset role;
select set_config('request.jwt.claims','{}',true);

-- Simulate a developer operating the real listing before external verification.
update public.apartments
  set status='active',moderation_status='pending',listing_workflow_status='draft',
      available_from=null
where id=current_setting('mde.san1502_booking_fixture')::uuid;

select lives_ok(
 $q$select public.p1_schedule_tour_atomic(
     current_setting('mde.san1502_booking_fixture'),
     'f1505000-0000-4000-8000-000000000002',
     'san1502-normal-renter-booking-1', 'form',
     'renter-san1502-booking@example.com', 'Renter 1502',
     null,null,now()+interval '3 days','{}'::jsonb,'{}'::jsonb)$q$,
 'authorized renter books the draft development apartment via canonical transaction');

select is((select count(*)::int from public.leads
  where apartment_id=current_setting('mde.san1502_booking_fixture')::uuid),1,
  'one lead committed');
select is((select count(*)::int from public.showings
  where apartment_id=current_setting('mde.san1502_booking_fixture')::uuid),1,
  'one showing committed');

select lives_ok(
 $q$select public.p1_schedule_tour_atomic(
     current_setting('mde.san1502_booking_fixture'),
     'f1505000-0000-4000-8000-000000000002',
     'san1502-normal-renter-booking-1', 'form',
     'renter-san1502-booking@example.com', 'Renter 1502',
     null,null,now()+interval '3 days','{}'::jsonb,'{}'::jsonb)$q$,
 'idempotent retry succeeds');
select is((select count(*)::int from public.showings
  where apartment_id=current_setting('mde.san1502_booking_fixture')::uuid),1,
  'retry did not create another showing');

-- UPDATEs that keep the booking identity are normal status bookkeeping.
select lives_ok(
 $q$update public.leads set user_id = user_id
    where apartment_id = current_setting('mde.san1502_booking_fixture')::uuid$q$,
 'unchanged lead identity is not blocked by the development fixture guard');
select lives_ok(
 $q$update public.showings set lead_id = lead_id
    where apartment_id = current_setting('mde.san1502_booking_fixture')::uuid$q$,
 'unchanged showing identity is not blocked');

-- An identity edit has to pass the same fixture authorization rule.
select throws_ok(
 $q$update public.leads
    set user_id = 'f1505000-0000-4000-8000-000000000003'
    where apartment_id = current_setting('mde.san1502_booking_fixture')::uuid$q$,
 '42501', 'development rental viewing requires an authorized renter',
 'lead renter reassignment to an ungranted actor is denied');
select throws_ok(
 $q$update public.showings
    set lead_id = 'f1505000-0000-4000-8000-000000000099'
    where apartment_id = current_setting('mde.san1502_booking_fixture')::uuid$q$,
 '42501', 'development rental viewing requires an authorized renter',
 'showing lead reassignment without authorized matching lead is denied');

select throws_ok(
 $q$select public.p1_schedule_tour_atomic(
     current_setting('mde.san1502_booking_fixture'),
     'f1505000-0000-4000-8000-000000000003',
     'san1502-ungranted-renter-booking', 'form',
     'ordinary-san1502-booking@example.com','Ordinary user',
     null,null,now()+interval '3 days','{}'::jsonb,'{}'::jsonb)$q$,
 '42501','development rental viewing requires an authorized renter',
 'ordinary ungranted account cannot book');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1505000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.admin_revoke_rental_test_access('f1505000-0000-4000-8000-000000000002','renter');
reset role;
select set_config('request.jwt.claims','{}',true);

select throws_ok(
 $q$select public.p1_schedule_tour_atomic(
     current_setting('mde.san1502_booking_fixture'),
     'f1505000-0000-4000-8000-000000000002',
     'san1502-normal-renter-booking-1', 'form',
     'renter-san1502-booking@example.com','Renter 1502',
     null,null,now()+interval '3 days','{}'::jsonb,'{}'::jsonb)$q$,
 '42501','development rental viewing requires an authorized renter',
 'revoking access denies even a committed booking replay');

select * from finish();
rollback;
