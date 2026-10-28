-- SAN-1542 · Reservation inbox reads follow the server-owned restaurant → partner
-- assignment. A partner-editable Google Place ID never grants access to requests.
begin;

select plan(13);

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('a1542000-0000-4000-8000-000000000001','san1542-partner-a@example.com'),
  ('a1542000-0000-4000-8000-000000000002','san1542-partner-b@example.com'),
  ('a1542000-0000-4000-8000-000000000003','san1542-admin@example.com'),
  ('a1542000-0000-4000-8000-000000000004','san1542-customer@example.com');


insert into public.partners (id, profile_id, type, settings) values
  ('a1542000-0000-4000-8000-000000000011','a1542000-0000-4000-8000-000000000001','venue','{}'::jsonb),
  ('a1542000-0000-4000-8000-000000000012','a1542000-0000-4000-8000-000000000002','venue','{}'::jsonb);

insert into public.partner_members (partner_id, profile_id, role) values
  ('a1542000-0000-4000-8000-000000000011','a1542000-0000-4000-8000-000000000001','owner'),
  ('a1542000-0000-4000-8000-000000000012','a1542000-0000-4000-8000-000000000002','owner');

insert into public.user_roles (user_id, role)
values ('a1542000-0000-4000-8000-000000000003','admin');

insert into public.partner_locations (id, partner_id, google_place_id) values
  ('a1542000-0000-4000-8000-000000000021','a1542000-0000-4000-8000-000000000011','place-1542-a');

insert into public.restaurants (id, name, partner_id, google_place_id) values
  ('a1542000-0000-4000-8000-000000000031','Inbox A','a1542000-0000-4000-8000-000000000011','place-1542-a'),
  ('a1542000-0000-4000-8000-000000000032','Inbox B','a1542000-0000-4000-8000-000000000012','place-1542-b'),
  ('a1542000-0000-4000-8000-000000000033','Unassigned Diner',null,null);

insert into public.venue_booking_requests
  (id, user_id, venue_kind, place_id, restaurant_id, party_size, requested_at,
   contact_name, contact_email, status, source, idempotency_key)
values
  ('a1542000-0000-4000-8000-000000000041','a1542000-0000-4000-8000-000000000004',
   'restaurant','place-1542-a','a1542000-0000-4000-8000-000000000031',2,now()+interval '1 day',
   'Customer A','customer@example.com','pending','web','vb-san1542-a'),
  ('a1542000-0000-4000-8000-000000000042','a1542000-0000-4000-8000-000000000004',
   'restaurant','place-1542-b','a1542000-0000-4000-8000-000000000032',4,now()+interval '2 day',
   'Customer B','customer@example.com','pending','web','vb-san1542-b'),
  ('a1542000-0000-4000-8000-000000000043',null,
   'restaurant','place-1542-unknown','a1542000-0000-4000-8000-000000000033',2,now()+interval '3 day',
   'Walk-in','walkin@example.com','pending','web','vb-san1542-c');

-- ── Anonymous ───────────────────────────────────────────────────────────────
set local role anon;
select is(
  (select count(*)::int from public.venue_booking_requests),
  0, 'anonymous visitors see no reservation requests');
reset role;

-- ── Customer keeps their own request ────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub','a1542000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::int from public.venue_booking_requests),
  2, 'the customer still sees the requests they submitted');

-- ── Partner A inbox ─────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','a1542000-0000-4000-8000-000000000001',true);
select is(
  (select count(*)::int from public.venue_booking_requests),
  1, 'partner A sees exactly their restaurant''s request');
select is(
  (select restaurant_id from public.venue_booking_requests limit 1),
  'a1542000-0000-4000-8000-000000000031'::uuid,
  'the visible request belongs to restaurant A');

-- ── Spoofed Google Place ID grants nothing ──────────────────────────────────
update public.partner_locations set google_place_id='place-1542-b'
where id='a1542000-0000-4000-8000-000000000021';
select is(
  (select google_place_id from public.partner_locations where id='a1542000-0000-4000-8000-000000000021'),
  'place-1542-b', 'partner A can rewrite their own Place ID');
select is(
  (select count(*)::int from public.venue_booking_requests),
  1, 'matching restaurant B''s Place ID still does not expose B''s request');
select is(
  (select count(*)::int from public.venue_booking_requests where restaurant_id='a1542000-0000-4000-8000-000000000032'),
  0, 'restaurant B''s request stays invisible to partner A');

-- ── Partner B inbox ─────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','a1542000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::int from public.venue_booking_requests),
  1, 'partner B sees only restaurant B''s request');
select is(
  (select restaurant_id from public.venue_booking_requests limit 1),
  'a1542000-0000-4000-8000-000000000032'::uuid,
  'the visible request belongs to restaurant B');

-- ── Unassigned restaurant stays private to admins ──────────────────────────
select is(
  (select count(*)::int from public.venue_booking_requests where restaurant_id='a1542000-0000-4000-8000-000000000033'),
  0, 'an unassigned restaurant''s request is not visible to any partner');

-- ── MDE Team ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub','a1542000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::int from public.venue_booking_requests),
  3, 'an admin sees every request');

-- ── Updates are not opened by this migration ───────────────────────────────
select set_config('request.jwt.claim.sub','a1542000-0000-4000-8000-000000000001',true);
with attempted as (
  update public.venue_booking_requests set status='confirmed'
  where restaurant_id='a1542000-0000-4000-8000-000000000031'
  returning id
)
select is((select count(*)::int from attempted), 0,
  'the inbox is read-only: a partner cannot confirm a request here');

reset role;
select is(
  (select status from public.venue_booking_requests where id='a1542000-0000-4000-8000-000000000041'),
  'pending', 'no request status was changed');

select * from finish();
rollback;
