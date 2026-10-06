-- SAN-1406/SAN-1408 — New Projects inventory integrity gates.
--
-- Locks the invariants the data-quality review required, so the next 50 listings cannot
-- silently reintroduce them. Runs against the local database after all migrations.
begin;

select plan(9);

-- Gate 1: never advertise a past delivery year on a published, not-delivered project.
select is(
  (select count(*)::int from public.development_projects
    where publish_state = 'published'
      and expected_delivery_year < extract(year from now())::integer
      and coalesce(project_status, '') not in ('delivered', 'sold_out')),
  0,
  'gate 1: no published project advertises a past delivery year unless delivered/sold_out');

-- Gate 2: the designated primary source must actually support the canonical price-from.
-- A developer source is authoritative by definition; any other source must record the price.
select is(
  (select count(*)::int
     from public.development_projects p
     join public.development_project_sources s on s.id = p.primary_source_id
    where p.publish_state = 'published'
      and p.price_from_cents is not null
      and s.source_type <> 'developer'
      and coalesce((s.observed_facts ->> 'price_from_cop')::numeric * 100, -1) <> p.price_from_cents),
  0,
  'gate 2: the primary source supports the canonical price-from');

-- Gate 3: one row per genuine typology — no duplicate (bedrooms, built, private) footprint.
select is(
  (select count(*)::int from (
     select 1
       from public.development_unit_types
      group by project_id, coalesce(bedrooms, -1), coalesce(built_area_m2, -1), coalesce(private_area_m2, -1)
     having count(*) > 1) d),
  0,
  'gate 3: no duplicate typology rows for one project');

-- Mixed-product: every unit type carries a product_class...
select is(
  (select count(*)::int from public.development_unit_types where product_class is null),
  0,
  'mixed-product: every unit type carries a product_class');

-- ...and a loft is never left classified as a residential apartment.
select is(
  (select count(*)::int
     from public.development_unit_types u
     join public.development_projects p on p.id = u.project_id
    where p.slug = 'olium-park' and u.bedrooms = 1 and u.built_area_m2 <= 40
      and u.product_class <> 'loft'),
  0,
  'mixed-product: the Olium 30 m² 1BR loft is tagged loft');

-- Source rank: developer is the most trusted, aggregator the least (discovery-only).
select is(public.development_source_rank('developer'), 1, 'rank: developer is first');
select is(public.development_source_rank('aggregator'), 3, 'rank: aggregator is last');

-- Distrito 33: primary is the source that observes the canonical price, not the older one.
select is(
  (select s.source_type
     from public.development_projects p
     join public.development_project_sources s on s.id = p.primary_source_id
    where p.slug = 'distrito-33'),
  'aggregator',
  'Distrito 33 primary supports the canonical price');

-- Cittadel: four apartment types, not seven price instances.
select is(
  (select count(*)::int
     from public.development_unit_types u
     join public.development_projects p on p.id = u.project_id
    where p.slug = 'cittadel' and u.product_class = 'residential_apartment'),
  4,
  'Cittadel exposes four apartment types');

select * from finish();
rollback;
