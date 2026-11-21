-- SAN-277 follow-up · trip position uniqueness and append allocation.
-- Self-contained and rolled back.
begin;
select plan(8);

insert into auth.users (id, email)
values ('f2770000-0000-0000-0000-000000000001', 'position-owner@example.com');

insert into public.trips (id, user_id, title, start_date, end_date)
values
  ('a2770000-0000-0000-0000-000000000001', 'f2770000-0000-0000-0000-000000000001', '[TEST] Position A', '2026-11-21', '2026-11-22'),
  ('a2770000-0000-0000-0000-000000000002', 'f2770000-0000-0000-0000-000000000001', '[TEST] Position B', '2026-11-21', '2026-11-22');

select has_column('public', 'trip_items', 'position', 'trip_items has position');

insert into public.trip_items (trip_id, item_type, source_id, title)
values ('a2770000-0000-0000-0000-000000000001', 'poi', gen_random_uuid(), 'Append zero');
select is(
  (select position from public.trip_items where title = 'Append zero'),
  0,
  'first append gets position 0'
);

insert into public.trip_items (trip_id, item_type, source_id, title)
values ('a2770000-0000-0000-0000-000000000001', 'poi', gen_random_uuid(), 'Append one');
select is(
  (select position from public.trip_items where title = 'Append one'),
  1,
  'second append gets the next position'
);

select throws_ok(
  $$ insert into public.trip_items (trip_id, item_type, source_id, title, position)
     values ('a2770000-0000-0000-0000-000000000001', 'poi', gen_random_uuid(), 'Duplicate slot', 1) $$,
  '23505',
  null,
  'duplicate position within one trip is rejected'
);

insert into public.trip_items (trip_id, item_type, source_id, title, position)
values ('a2770000-0000-0000-0000-000000000002', 'poi', gen_random_uuid(), 'Same slot other trip', 1);
select is(
  (select count(*)::int from public.trip_items
    where trip_id = 'a2770000-0000-0000-0000-000000000002' and position = 1),
  1,
  'same position is valid in a different trip'
);

insert into public.trip_items (trip_id, item_type, source_id, title, position)
values ('a2770000-0000-0000-0000-000000000002', 'poi', gen_random_uuid(), 'Explicit slot', 5);
insert into public.trip_items (trip_id, item_type, source_id, title)
values ('a2770000-0000-0000-0000-000000000002', 'poi', gen_random_uuid(), 'Append after explicit');
select is(
  (select position from public.trip_items where title = 'Append after explicit'),
  6,
  'append allocates max(position)+1'
);

select is(
  (select condeferrable from pg_constraint
    where conname = 'trip_items_trip_id_position_unique'),
  true,
  'position uniqueness is deferrable'
);

set constraints trip_items_trip_id_position_unique deferred;
update public.trip_items
set position = position + 1
where trip_id = 'a2770000-0000-0000-0000-000000000001';
select is(
  (select array_agg(position order by position) from public.trip_items
    where trip_id = 'a2770000-0000-0000-0000-000000000001'),
  array[1, 2],
  'a deferred reorder can shift slots in one transaction'
);

select * from finish();
rollback;
