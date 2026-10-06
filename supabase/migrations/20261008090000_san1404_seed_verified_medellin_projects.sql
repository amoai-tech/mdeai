-- =============================================================================
-- Migration: 20261008090000_san1404_seed_verified_medellin_projects.sql
-- Task:      SAN-1404 · MDE New Projects — Add 10 Verified Medellín Projects
-- Source:    docs/07-operations/new-projects-candidates.json (SAN-1405)
-- =============================================================================
-- Seeds exactly 10 real, verified Medellín new-construction projects with
-- provenance. External developers are NOT MDE partners: every project is
-- ownership_status='unclaimed' and partner_id IS NULL.
--
-- TIMESTAMPS are research facts, not deploy facts: verified_at / checked_at come
-- from the source's own checked_at in the candidate artifact
-- (verification batch 2026-10-06T09:21:53Z), never now(). Zonario's source_updated_at
-- (2026-09-26) is carried through too.
--
-- Facts come only from the candidate artifact; anything a source did not show is
-- NULL. No price, availability, coordinate, delivery or unit fact is invented.
-- Canonical numeric facts may come from a Tier A developer page or a Tier B
-- aggregator card; the source row's confidence records which.
--
-- Idempotent: ON CONFLICT targets the natural keys
--   * development_projects.source_key
--   * development_project_sources(project_id, source_url)
--   * development_unit_types(project_id, source_key)
-- so replaying cannot duplicate rows, and the publish/primary-source update only
-- touches unclaimed rows — a replay after a real claim fails closed.
-- =============================================================================

begin;

-- 1 · projects (draft first; published only after provenance exists)
insert into public.development_projects (
  source_key, slug, name, source_owner, city, neighborhood, address,
  latitude, longitude, project_status, publish_state, price_from_cents, price_to_cents, currency,
  expected_delivery_year, delivery_note, vis_flag, source_kind, source_url,
  verified_at, primary_source_id, partner_id, ownership_status
) values
  ('medellin:new-project:nexus', 'nexus', 'Nexus', 'G+ Proyectos / Solidus', 'Medellín', 'Laureles', null, null, null, null, 'draft', 158700000000, 158700000000, 'COP', 2027, null, false, 'aggregator', 'https://www.zonario.co/proyectos-de-vivienda/medellin/laureles', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:distrito-33', 'distrito-33', 'Distrito 33', 'Arco Construcciones e Ingeniería SAS', 'Medellín', 'Laureles', null, null, null, 'pre_sale', 'draft', null, null, 'COP', null, null, null, 'marketplace', 'https://tulugar.com/en/projects/colombia/distrito-33', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:grand-coral', 'grand-coral', 'Grand Coral', 'Construcciones Prisma', 'Medellín', 'Laureles', null, null, null, null, 'draft', null, null, 'COP', null, null, null, 'developer', 'https://landing.construccionesprisma.com.co/grand-coral-apartamentos/', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:nutibara-parkway', 'nutibara-parkway', 'Nutibara Parkway', 'BEMSA / Proin', 'Medellín', 'Laureles', null, null, null, null, 'draft', 37040637900, 83484317400, 'COP', null, null, false, 'aggregator', 'https://www.zonario.co/proyectos-de-vivienda/medellin/laureles', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:vigo', 'vigo', 'Vigo', 'SR Proyectos Constructivos', 'Medellín', 'Laureles', null, null, null, 'under_construction', 'draft', null, null, 'COP', null, null, null, 'marketplace', 'https://tulugar.com/en/projects/colombia/vigo', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:arrayan', 'arrayan', 'Arrayán', 'Amarilo', 'Medellín', 'Ciudad del Río', 'Calle 17 #43F-122', 6.2184216566219, -75.573193148489, 'pre_sale', 'draft', 57500000000, null, 'COP', null, null, false, 'developer', 'https://amarilo.com.co/proyecto/arrayan', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:saman', 'saman', 'Samán', 'Amarilo / C.A.S.A.', 'Medellín', 'Ciudad del Río', 'Calle 17 #43F-122', null, null, 'pre_sale', 'draft', null, null, 'COP', null, 'Estimada', false, 'developer', 'https://amarilo.com.co/proyecto/saman-jardines-del-rio', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:guayacanes', 'guayacanes', 'Guayacanes', 'Amarilo / C.A.S.A.', 'Medellín', 'Ciudad del Río', 'Calle 17 #43F-122', null, null, 'pre_sale', 'draft', null, null, 'COP', null, 'Estimada', false, 'developer', 'https://amarilo.com.co/proyecto/guayacanes-jardines-del-rio', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:palma', 'palma', 'Palma', 'Amarilo / C.A.S.A.', 'Medellín', 'Ciudad del Río', 'Calle 17 #43F-122', null, null, 'pre_sale', 'draft', null, null, 'COP', 2029, 'Segundo Semestre 2029 Etapa 1', false, 'developer', 'https://amarilo.com.co/proyecto/palma', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed'),
  ('medellin:new-project:river-park', 'river-park', 'River Park', 'Arquitectura y Concreto / Londoño Gómez', 'Medellín', 'Ciudad del Río', null, null, null, null, 'draft', 65021700000, null, 'COP', null, null, null, 'developer', 'https://londonogomez.com/proyectos-vivienda/medellin/river-park-0', '2026-10-06T09:21:53Z'::timestamptz, null, null, 'unclaimed')
on conflict (source_key) do nothing;

-- 2 · provenance (http_status / checked_at / source_updated_at / scope are facts)
insert into public.development_project_sources (
  project_id, source_url, source_type, scope, http_status, checked_at,
  source_updated_at, fact_status, confidence, observed_facts
)
select dp.id, v.source_url, v.source_type, v.scope, v.http_status, v.checked_at,
       v.source_updated_at, v.fact_status, v.confidence, v.observed_facts
from (values
  ('medellin:new-project:nexus', 'https://www.zonario.co/proyectos-de-vivienda/medellin/laureles', 'aggregator', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, '2026-09-26'::timestamptz, 'confirmed', 'B', '{"project_name":"Nexus","listed_in_laureles_inventory":true,"price_from_cop":1587000000,"price_to_cop":1587000000,"area_min_m2":136,"area_max_m2":136,"delivery_year":2027,"vis_flag":false}'::jsonb),
  ('medellin:new-project:distrito-33', 'https://tulugar.com/en/projects/colombia/distrito-33', 'marketplace', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'B', '{"project_name":"Distrito 33","developer":"Arco Construcciones e Ingeniería SAS","project_status":"Pre-Sale","bedrooms_min":1,"unit_area_min_m2":27}'::jsonb),
  ('medellin:new-project:grand-coral', 'https://landing.construccionesprisma.com.co/grand-coral-apartamentos/', 'developer', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'A', '{"project_name":"Grand Coral Apartamentos","developer":"Construcciones Prisma"}'::jsonb),
  ('medellin:new-project:nutibara-parkway', 'https://www.zonario.co/proyectos-de-vivienda/medellin/laureles', 'aggregator', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, '2026-09-26'::timestamptz, 'confirmed', 'B', '{"project_name":"Nutibara Parkway","listed_in_laureles_inventory":true,"price_from_cop":370406379,"price_to_cop":834843174,"area_min_m2":19,"area_max_m2":47,"vis_flag":false}'::jsonb),
  ('medellin:new-project:vigo', 'https://tulugar.com/en/projects/colombia/vigo', 'marketplace', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'B', '{"project_name":"Vigo","developer":"Sr Proyectos Constructivos","project_status":"Under Development","bedrooms_min":1,"bedrooms_max":2,"unit_area_min_m2":31}'::jsonb),
  ('medellin:new-project:arrayan', 'https://amarilo.com.co/proyecto/arrayan', 'developer', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'A', '{"project_name":"Arrayán","developer":"Amarilo","address":"Cl. 17 #43F - 122","project_status":"Sobre planos","price_from_cop":575000000,"area_min_m2":30,"vis_flag":false,"towers":1,"units":216,"latitude":6.2184216566219,"longitude":-75.573193148489}'::jsonb),
  ('medellin:new-project:saman', 'https://amarilo.com.co/proyecto/saman-jardines-del-rio', 'developer', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'A', '{"project_name":"Samán - Jardines del Río","developer":"Amarilo","address":"Cl. 17 #43F - 122","project_status":"Sobre planos","delivery_note":"Estimada","vis_flag":false,"towers":4,"units":676,"areas_m2":[56,80,89]}'::jsonb),
  ('medellin:new-project:guayacanes', 'https://amarilo.com.co/proyecto/guayacanes-jardines-del-rio', 'developer', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'A', '{"project_name":"Guayacanes - Jardines del Río","developer":"Amarilo","address":"Cl. 17 #43F - 122","project_status":"Sobre planos","delivery_note":"Estimada","vis_flag":false,"towers":2,"units":260,"areas_m2":[96,110,162]}'::jsonb),
  ('medellin:new-project:palma', 'https://amarilo.com.co/proyecto/palma', 'developer', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'A', '{"project_name":"Palma","developer":"Amarilo","address":"Calle 17 # 43F-122","delivery_note":"Segundo Semestre 2029 Etapa 1","areas_m2":[129,150,166],"project_status":"Sobre planos","vis_flag":false,"builder":"C.A.S.A.","marketer":"Amarilo"}'::jsonb),
  ('medellin:new-project:river-park', 'https://londonogomez.com/proyectos-vivienda/medellin/river-park-0', 'developer', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'A', '{"project_name":"River Park","neighborhood":"Ciudad del Río / El Poblado","price_from_cop":650217000,"area_min_m2":47,"area_max_m2":59,"bedrooms_min":1,"bedrooms_max":2}'::jsonb),
  ('medellin:new-project:river-park', 'https://arquitecturayconcreto.com/proyectos/antioquia/river-park/', 'developer', 'project', 200, '2026-10-06T09:21:53Z'::timestamptz, null, 'confirmed', 'A', '{"project_name":"River Park"}'::jsonb)
) as v(source_key, source_url, source_type, scope, http_status, checked_at, source_updated_at, fact_status, confidence, observed_facts)
join public.development_projects dp on dp.source_key = v.source_key
on conflict (project_id, source_url) do nothing;

-- 3 · unit typologies (source_kind/source_url per unit: developer vs marketplace)
insert into public.development_unit_types (
  project_id, source_key, name, bedrooms, bathrooms, built_area_m2, private_area_m2,
  currency, source_kind, source_url, verified_at
)
select dp.id, v.unit_key, v.name, v.bedrooms, v.bathrooms, v.built, v.priv,
       'COP', v.source_kind, v.source_url, '2026-10-06T09:21:53Z'::timestamptz
from (values
  ('medellin:new-project:distrito-33', 'distrito-33-27m-1br', 'Desde 27 m² · 1 alcoba', 1, null, 27, null, 'marketplace', 'https://tulugar.com/en/projects/colombia/distrito-33'),
  ('medellin:new-project:vigo', 'vigo-31m', 'Desde 31 m² · 1–2 alcobas', null, null, 31, null, 'marketplace', 'https://tulugar.com/en/projects/colombia/vigo'),
  ('medellin:new-project:arrayan', 'arrayan-30m-1br', 'Apto 30 m²', 1, 1, 30, 22, 'developer', 'https://amarilo.com.co/proyecto/arrayan'),
  ('medellin:new-project:arrayan', 'arrayan-39m-1br', 'Apto 39 m²', 1, 1, 39, 31, 'developer', 'https://amarilo.com.co/proyecto/arrayan'),
  ('medellin:new-project:arrayan', 'arrayan-45m-1br', 'Apto 45 m²', 1, 1, 45, 35, 'developer', 'https://amarilo.com.co/proyecto/arrayan'),
  ('medellin:new-project:arrayan', 'arrayan-64m-2br', 'Apto 64 m²', 2, 2, 64, 54, 'developer', 'https://amarilo.com.co/proyecto/arrayan'),
  ('medellin:new-project:arrayan', 'arrayan-83m-3br', 'Apto 83 m²', 3, 3, 83, 72, 'developer', 'https://amarilo.com.co/proyecto/arrayan'),
  ('medellin:new-project:arrayan', 'arrayan-100m-3br', 'Apto 100 m²', 3, 3, 100, 86, 'developer', 'https://amarilo.com.co/proyecto/arrayan'),
  ('medellin:new-project:saman', 'saman-56m', 'Apto 56 m²', null, null, 56, 43, 'developer', 'https://amarilo.com.co/proyecto/saman-jardines-del-rio'),
  ('medellin:new-project:saman', 'saman-80m', 'Apto 80 m²', null, null, 80, 66, 'developer', 'https://amarilo.com.co/proyecto/saman-jardines-del-rio'),
  ('medellin:new-project:saman', 'saman-89m', 'Apto 89 m²', null, null, 89, 76, 'developer', 'https://amarilo.com.co/proyecto/saman-jardines-del-rio'),
  ('medellin:new-project:guayacanes', 'guayacanes-96m', 'Apto 96 m²', null, null, 96, 78, 'developer', 'https://amarilo.com.co/proyecto/guayacanes-jardines-del-rio'),
  ('medellin:new-project:guayacanes', 'guayacanes-110m', 'Apto 110 m²', null, null, 110, 92, 'developer', 'https://amarilo.com.co/proyecto/guayacanes-jardines-del-rio'),
  ('medellin:new-project:guayacanes', 'guayacanes-162m', 'Apto 162 m²', null, null, 162, 128, 'developer', 'https://amarilo.com.co/proyecto/guayacanes-jardines-del-rio'),
  ('medellin:new-project:palma', 'palma-129m-3br', 'Apto 129 m²', 3, 3, 129, 101, 'developer', 'https://amarilo.com.co/proyecto/palma'),
  ('medellin:new-project:palma', 'palma-150m-3br', 'Apto 150 m²', 3, 3, 150, 118, 'developer', 'https://amarilo.com.co/proyecto/palma'),
  ('medellin:new-project:palma', 'palma-166m-3br', 'Apto 166 m²', 3, 3, 166, 125, 'developer', 'https://amarilo.com.co/proyecto/palma'),
  ('medellin:new-project:river-park', 'river-park-47m', 'Desde 47 m² · 1–2 alcobas', null, null, 47, null, 'developer', 'https://londonogomez.com/proyectos-vivienda/medellin/river-park-0')
) as v(source_key, unit_key, name, bedrooms, bathrooms, built, priv, source_kind, source_url)
join public.development_projects dp on dp.source_key = v.source_key
on conflict (project_id, source_key) do nothing;

-- 4 · set primary source and publish, only while still unclaimed and unset
update public.development_projects dp
set primary_source_id = s.id,
    publish_state = 'published'
from public.development_project_sources s
where s.project_id = dp.id
  and s.source_url = dp.source_url
  and dp.source_key = any(array['medellin:new-project:nexus', 'medellin:new-project:distrito-33', 'medellin:new-project:grand-coral', 'medellin:new-project:nutibara-parkway', 'medellin:new-project:vigo', 'medellin:new-project:arrayan', 'medellin:new-project:saman', 'medellin:new-project:guayacanes', 'medellin:new-project:palma', 'medellin:new-project:river-park'])
  and dp.ownership_status = 'unclaimed'
  and dp.partner_id is null
  and dp.primary_source_id is null;

-- 5 · fail closed before commit
do $$
declare
  v_keys text[] := array['medellin:new-project:nexus', 'medellin:new-project:distrito-33', 'medellin:new-project:grand-coral', 'medellin:new-project:nutibara-parkway', 'medellin:new-project:vigo', 'medellin:new-project:arrayan', 'medellin:new-project:saman', 'medellin:new-project:guayacanes', 'medellin:new-project:palma', 'medellin:new-project:river-park'];
  v_bad int;
begin
  select count(*) into v_bad from unnest(v_keys) k
   where not exists (select 1 from public.development_projects p where p.source_key = k);
  if v_bad > 0 then raise exception 'SAN-1404: % seeded project(s) missing', v_bad; end if;

  select count(*) into v_bad from public.development_projects p
   where p.source_key = any(v_keys) and (p.ownership_status <> 'unclaimed' or p.partner_id is not null);
  if v_bad > 0 then raise exception 'SAN-1404: % seeded project(s) claimed or partnered', v_bad; end if;

  select count(*) into v_bad from public.development_projects p
   where p.source_key = any(v_keys)
     and not exists (select 1 from public.development_project_sources s where s.project_id = p.id);
  if v_bad > 0 then raise exception 'SAN-1404: % seeded project(s) without provenance', v_bad; end if;

  select count(*) into v_bad from public.development_projects p
   where p.source_key = any(v_keys) and p.publish_state = 'published' and p.primary_source_id is null;
  if v_bad > 0 then raise exception 'SAN-1404: % published project(s) without a primary source', v_bad; end if;

  select count(*) into v_bad
    from public.development_project_sources s
    join public.development_projects p on p.id = s.project_id
   where p.source_key = any(v_keys)
     and (s.checked_at is null or s.http_status is distinct from 200 or s.scope <> 'project');
  if v_bad > 0 then raise exception 'SAN-1404: % source(s) without checked_at/HTTP 200/project scope', v_bad; end if;

  select count(*) into v_bad from public.development_projects p
   where p.source_key = any(v_keys)
     and (p.price_from_cents < 0 or p.price_to_cents < p.price_from_cents
          or ((p.latitude is null) <> (p.longitude is null)));
  if v_bad > 0 then raise exception 'SAN-1404: % seeded project(s) violate a numeric/coordinate invariant', v_bad; end if;

  select count(*) into v_bad
    from public.development_unit_types u
    join public.development_projects p on p.id = u.project_id
   where p.source_key = any(v_keys)
     and u.source_kind is distinct from (case when u.source_url like '%tulugar.com%' then 'marketplace' else 'developer' end);
  if v_bad > 0 then raise exception 'SAN-1404: % unit(s) have a mismatched source_kind', v_bad; end if;
end $$;

commit;
