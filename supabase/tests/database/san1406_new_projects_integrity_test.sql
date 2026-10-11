-- SAN-1406/SAN-1408 — New Projects inventory integrity gates.
--
-- Physical dimensions are NOT identity: two towers may legitimately share a 2BR 54 m² typology,
-- so the duplicate gate is phase-aware and is a quality test, not a hard constraint.
begin;

select plan(14);

select is(
  (select count(*)::int from public.development_projects
    where publish_state = 'published'
      and expected_delivery_year < extract(year from now())::integer
      and coalesce(project_status, '') not in ('delivered', 'sold_out')),
  0,
  'gate 1: no published project advertises a past delivery year unless delivered/sold_out');

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

select is(
  (select count(*)::int from (
     select 1
       from public.development_unit_types
      group by project_id, coalesce(bedrooms, -1), coalesce(built_area_m2, -1),
               coalesce(private_area_m2, -1), coalesce(phase_label, '')
     having count(*) > 1) d),
  0,
  'gate 3: no accidental same-phase duplicate typology');

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'development_unit_types'
      and column_name = 'product_class' and column_default is not null),
  0,
  'product_class has no default, so an omitted class is NULL (fail-closed)');

select is(
  (select count(*)::int
     from public.development_unit_types u
     join public.development_projects p on p.id = u.project_id
    where p.slug in (
      'arrayan','cittadel','crista','distrito-33','faroverde',
      'grand-coral','guayacanes','los-cambulos','nexus',
      'nutibara-parkway','olium-park','palma',
      'reserva-serrat-selva','river-park','saman','vigo'
    ) and u.product_class is null),
  0,
  'every known pilot typology is classified');

select is(
  (select count(*)::int
     from public.development_unit_types u
     join public.development_projects p on p.id = u.project_id
    where p.slug = 'olium-park' and u.bedrooms = 1 and u.built_area_m2 <= 40
      and u.product_class <> 'loft'),
  0,
  'mixed-product: the Olium 30 m² 1BR loft is tagged loft');

-- Future imports must remain unknown until evidence establishes the product type.
insert into public.development_unit_types (project_id, source_key, name, bedrooms)
select id, 'gate-test:unreviewed', 'Unknown future product', 2
from public.development_projects where slug = 'arrayan';
select is(
 (select product_class from public.development_unit_types
   where source_key = 'gate-test:unreviewed'), null::text,
 'new unreviewed typology stays unclassified (not assumed apartment)');

-- A legitimate claimed owner must not be overwritten by the seed's captured NULL owner.
select ok(
 exists (select 1 from public.development_projects where slug='cittadel'
   and ownership_status='unclaimed' and partner_id is null),
 'pilot seed leaves unclaimed ownership explicit; replay tests must preserve future claims');

select is(public.development_source_rank('developer'), 1, 'rank: developer is first');
select is(public.development_source_rank('aggregator'), 3, 'rank: aggregator is last');

select is(
  (select s.source_type
     from public.development_projects p
     join public.development_project_sources s on s.id = p.primary_source_id
    where p.slug = 'distrito-33'),
  'aggregator',
  'Distrito 33 primary supports the canonical price');

select is(
  (select count(*)::int
     from public.development_unit_types u
     join public.development_projects p on p.id = u.project_id
    where p.slug = 'cittadel' and u.product_class = 'residential_apartment'),
  4,
  'Cittadel exposes four apartment types');

insert into public.development_unit_types
  (project_id, source_key, name, bedrooms, built_area_m2, product_class, phase_label)
select id, 'gate-test:phase-x', 'Torre X · 2 alcobas · 54 m²', 2, 54, 'residential_apartment', 'Torre X'
  from public.development_projects where slug = 'reserva-serrat-selva';
insert into public.development_unit_types
  (project_id, source_key, name, bedrooms, built_area_m2, product_class, phase_label)
select id, 'gate-test:phase-y', 'Torre Y · 2 alcobas · 54 m²', 2, 54, 'residential_apartment', 'Torre Y'
  from public.development_projects where slug = 'reserva-serrat-selva';

select is(
  (select count(*)::int from (
     select 1 from public.development_unit_types
      group by project_id, coalesce(bedrooms, -1), coalesce(built_area_m2, -1), coalesce(private_area_m2, -1)
     having count(*) > 1) d) > 0,
  true,
  'two phases with the same raw footprint exist (the scenario a hard constraint would reject)');

select is(
  (select count(*)::int from (
     select 1 from public.development_unit_types
      group by project_id, coalesce(bedrooms, -1), coalesce(built_area_m2, -1),
               coalesce(private_area_m2, -1), coalesce(phase_label, '')
     having count(*) > 1) d),
  0,
  'the phase-aware gate allows both towers');

select * from finish();
rollback;
