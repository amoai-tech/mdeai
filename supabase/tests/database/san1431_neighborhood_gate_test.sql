-- SAN-1431 §4.1 · the launch gate must reject an unverified neighborhood.
--
-- The staged candidates all carry the literal placeholder 'Pending verification'
-- yet satisfied the location requirement. This proves the new blocker is
-- fail-closed for placeholders/blank and absent for a real value.
--
-- Run with: supabase test db
begin;

select plan(6);

insert into public.apartments (id, title, slug, neighborhood, status, moderation_status, listing_workflow_status, landlord_id)
values ('d1431000-0000-4000-8000-000000000001', 'SAN1431 neighborhood', 'san1431-neighborhood',
        'Laureles', 'inactive', 'pending', 'draft', null);

select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  false, 'A1: a real neighborhood does not add the blocker');
update public.apartments set neighborhood = 'Pending verification'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A2: the staging placeholder blocks publication');
update public.apartments set neighborhood = '   '
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A3: a blank neighborhood blocks publication');
update public.apartments set neighborhood = 'por verificar'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A4: another placeholder blocks publication');
update public.apartments set neighborhood = 'unknown'
 where id = 'd1431000-0000-4000-8000-000000000001';
select is(public.rental_listing_launch_blockers('d1431000-0000-4000-8000-000000000001', false) @> array['no verified neighborhood']::text[],
  true, 'A5: an unknown placeholder blocks publication');

select is((
  select count(*)::int from public.apartments a
   where a.slug like 'candidate-rentberry-%'
     and public.rental_listing_launch_blockers(a.id, false) @> array['no verified neighborhood']::text[]
), 10, 'A6: every staged candidate is blocked by the neighborhood gate');

select * from finish();
rollback;
