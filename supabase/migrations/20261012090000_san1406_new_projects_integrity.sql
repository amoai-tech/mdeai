-- SAN-1406/SAN-1408 — New Projects inventory integrity (additive + corrective).
--
-- Answers the data-quality review of the seven flagged listings without redesigning the
-- three-table model. Idempotent: re-running is safe.
--
-- 1. product_class + phase_label on unit types (mixed-product + phased projects).
-- 2. development_source_rank(): developer=1, marketplace=2, aggregator=3.
-- 3. One row per genuine typology — price instances can no longer masquerade as types.
-- 4. Verified corrections: Distrito provenance, Cittadel, Reserva, Olium.
-- 5. Past delivery claims on un-delivered published projects are cleared.

-- ── 1. Unit-type classification ─────────────────────────────────────────────
alter table public.development_unit_types
  add column if not exists product_class text not null default 'residential_apartment';
alter table public.development_unit_types
  add column if not exists phase_label text;

alter table public.development_unit_types
  drop constraint if exists development_unit_types_product_class_check;
alter table public.development_unit_types
  add constraint development_unit_types_product_class_check
  check (product_class in ('residential_apartment', 'loft', 'commercial', 'office', 'medical'));

comment on column public.development_unit_types.product_class is
  'Mixed-product guard: a residential-apartment search must not match a loft/commercial/office/medical row.';
comment on column public.development_unit_types.phase_label is
  'Tower/phase for phased projects (e.g. Reserva Serrat Selva); null when the project has one phase.';

-- ── 2. Source trust rank ────────────────────────────────────────────────────
create or replace function public.development_source_rank(p_source_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_source_type
    when 'developer' then 1
    when 'marketplace' then 2
    when 'aggregator' then 3
    else 4
  end
$$;

comment on function public.development_source_rank(text) is
  'Trust rank for a New Projects source: developer first, aggregator last (discovery-only).';

-- ── 3. One row per genuine typology ─────────────────────────────────────────
delete from public.development_unit_types u
using public.development_projects p
where p.id = u.project_id
  and p.slug in ('cittadel', 'reserva-serrat-selva', 'crista');

create unique index if not exists development_unit_types_typology_uniq
  on public.development_unit_types (
    project_id,
    coalesce(bedrooms, -1),
    coalesce(built_area_m2, -1),
    coalesce(private_area_m2, -1)
  );

-- ── 4a. Cittadel — apartment types A–D plus one loft (Ascenso first-party) ──
insert into public.development_unit_types
  (project_id, source_key, name, bedrooms, built_area_m2, private_area_m2,
   price_from_cents, currency, product_class, source_kind, source_url, verified_at)
select p.id, v.source_key, v.name, v.bedrooms, v.built, v.priv, v.pf, 'COP',
       v.product_class, 'developer', 'https://www.ascenso.co/proyecto/id/3/cittadel',
       timestamptz '2026-10-06T13:54:16Z'
from public.development_projects p
cross join (values
  ('medellin:new-project:cittadel:unit:type-a', 'Tipo A · 2 alcobas · 62,6 m²', 2::smallint, 62.60::numeric, 57.60::numeric, 70489853600::bigint, 'residential_apartment'),
  ('medellin:new-project:cittadel:unit:type-b', 'Tipo B · 2 alcobas · 62,6 m²', 2::smallint, 62.60::numeric, 57.80::numeric, null::bigint, 'residential_apartment'),
  ('medellin:new-project:cittadel:unit:type-c', 'Tipo C · 2 alcobas · 67,8 m²', 2::smallint, 67.80::numeric, 60.60::numeric, null::bigint, 'residential_apartment'),
  ('medellin:new-project:cittadel:unit:type-d', 'Tipo D · 3 alcobas · 80,9 m²', 3::smallint, 80.90::numeric, 72.50::numeric, null::bigint, 'residential_apartment'),
  ('medellin:new-project:cittadel:unit:loft-28', 'Loft · 28 m²', null::smallint, 28.00::numeric, null::numeric, 40623625400::bigint, 'loft')
) as v(source_key, name, bedrooms, built, priv, pf, product_class)
where p.slug = 'cittadel'
on conflict (project_id, source_key) do update set
  name = excluded.name,
  bedrooms = excluded.bedrooms,
  built_area_m2 = excluded.built_area_m2,
  private_area_m2 = excluded.private_area_m2,
  price_from_cents = excluded.price_from_cents,
  product_class = excluded.product_class,
  source_kind = excluded.source_kind,
  source_url = excluded.source_url,
  verified_at = excluded.verified_at;

-- ── 4b. Reserva Serrat Selva — three real towers (Monserrate first-party) ───
insert into public.development_unit_types
  (project_id, source_key, name, bedrooms, built_area_m2, price_from_cents, price_to_cents,
   currency, product_class, phase_label, source_kind, source_url, verified_at)
select p.id, v.source_key, v.name, 2::smallint, v.built, v.pf, v.pt, 'COP',
       'residential_apartment', v.phase, 'developer',
       'https://www.constructoramonserrate.com/projects_types/no-vis/',
       timestamptz '2026-10-06T13:54:16Z'
from public.development_projects p
cross join (values
  ('medellin:new-project:reserva-serrat-selva:unit:torre-1', 'Torre 1 · 2 alcobas · 46 m²', 46.00::numeric, null::bigint, null::bigint, 'Torre 1'),
  ('medellin:new-project:reserva-serrat-selva:unit:torre-2', 'Torre 2 · 2 alcobas · 57 m²', 57.00::numeric, null::bigint, null::bigint, 'Torre 2'),
  ('medellin:new-project:reserva-serrat-selva:unit:torre-3', 'Torre 3 · 2 alcobas · 54 m²', 54.00::numeric, 43470000000::bigint, 43850000000::bigint, 'Torre 3')
) as v(source_key, name, built, pf, pt, phase)
where p.slug = 'reserva-serrat-selva'
on conflict (project_id, source_key) do update set
  name = excluded.name,
  built_area_m2 = excluded.built_area_m2,
  price_from_cents = excluded.price_from_cents,
  price_to_cents = excluded.price_to_cents,
  phase_label = excluded.phase_label,
  product_class = excluded.product_class,
  source_kind = excluded.source_kind,
  source_url = excluded.source_url,
  verified_at = excluded.verified_at;

-- ── 4b-2. Crista — one typology with a price range, not two price instances ──
insert into public.development_unit_types
  (project_id, source_key, name, bedrooms, built_area_m2, price_from_cents, price_to_cents,
   currency, product_class, source_kind, source_url, verified_at)
select p.id, 'medellin:new-project:crista:unit:3-75', '3 alcobas · 75 m²', 3::smallint,
       75.00::numeric, 75485200000::bigint, 75800000000::bigint, 'COP',
       'residential_apartment', 'aggregator', 'https://www.zonario.co/proyecto/medellin/crista',
       timestamptz '2026-10-06T13:54:16Z'
from public.development_projects p
where p.slug = 'crista'
on conflict (project_id, source_key) do update set
  name = excluded.name,
  bedrooms = excluded.bedrooms,
  built_area_m2 = excluded.built_area_m2,
  price_from_cents = excluded.price_from_cents,
  price_to_cents = excluded.price_to_cents,
  product_class = excluded.product_class,
  source_kind = excluded.source_kind,
  source_url = excluded.source_url,
  verified_at = excluded.verified_at;

-- ── 4c. Mixed-product tagging ───────────────────────────────────────────────
-- Olium Park sells a 30 m² loft line beside 64–77 m² homes.
update public.development_unit_types u
set product_class = 'loft'
from public.development_projects p
where p.id = u.project_id
  and p.slug = 'olium-park'
  and u.bedrooms = 1
  and u.built_area_m2 <= 40;

-- ── 4d. Distrito provenance — the source that supports the canonical price ──
-- Zonario observes the canonical address/price; TuLugar is the 26 vs 27 m² disagreement.
update public.development_projects p
set primary_source_id = s.id,
    source_url = s.source_url,
    verified_at = s.checked_at
from public.development_project_sources s
where p.slug = 'distrito-33'
  and s.project_id = p.id
  and p.price_from_cents is not null
  and (s.observed_facts ->> 'price_from_cop')::numeric * 100 = p.price_from_cents;

-- ── 4e. Developer sources + primary for Cittadel and Reserva ────────────────
insert into public.development_project_sources
  (project_id, source_url, source_type, scope, http_status, checked_at,
   fact_status, confidence, notes, observed_facts)
select p.id, v.url, 'developer', 'project', 200, timestamptz '2026-10-06T13:54:16Z',
       'confirmed', 'A', v.note, v.facts::jsonb
from public.development_projects p
join (values
  ('cittadel', 'https://www.ascenso.co/proyecto/id/3/cittadel',
   'Ascenso first-party: apartment types A–D plus a separate loft line.',
   '{"price_from_cop": 704898536, "bedrooms_min": 2, "bedrooms_max": 3, "area_min_m2": 28, "area_max_m2": 80.9}'),
  ('reserva-serrat-selva', 'https://www.constructoramonserrate.com/projects_types/no-vis/',
   'Monserrate first-party: Torre 1/2 46–57 m², Torre 3 54 m².',
   '{"bedrooms_min": 2, "bedrooms_max": 2, "area_min_m2": 46, "area_max_m2": 57, "towers": 3}')
) as v(slug, url, note, facts) on p.slug = v.slug
where not exists (
  select 1 from public.development_project_sources s
  where s.project_id = p.id and s.source_url = v.url
);

update public.development_projects p
set primary_source_id = s.id, source_url = s.source_url, verified_at = s.checked_at
from public.development_project_sources s
where s.project_id = p.id
  and s.source_type = 'developer'
  and p.slug in ('cittadel', 'reserva-serrat-selva');

-- ── 5. Never present an unverified past delivery as current ─────────────────
update public.development_projects
set expected_delivery_year = null,
    delivery_note = coalesce(delivery_note, 'Delivery year not reported by a current published source')
where expected_delivery_year < extract(year from now())::integer
  and coalesce(project_status, '') not in ('delivered', 'sold_out');
