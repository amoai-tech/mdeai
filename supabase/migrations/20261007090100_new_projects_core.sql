-- =============================================================================
-- Migration: 20261007090100_new_projects_core.sql
-- Task:      SAN-1385 · Build the Safe Data Foundation for New Condo Projects,
--            Leads, and Commissions
-- =============================================================================
-- Creates the canonical New Projects project inventory:
--   * development_projects        — one row per project (decision D1 ownership)
--   * development_unit_types      — project-level typologies, no exact units
--   * development_project_sources — multi-source, conflict-preserving provenance (D2)
--
-- Design rules enforced here:
--   * partner_id is NULLABLE and is the operational owner only when claimed (D1).
--   * Unknown facts stay NULL; nothing is coerced to 0/false/unavailable.
--   * Every exposed table has RLS + explicit grants in this same file.
--   * No vector/HNSW tables, no exact-unit table, no Edge Function.
--
-- Depends on: 20261007090000_new_projects_enums.sql (must be committed first)
-- Replay-safe: create ... if not exists; drop policy/constraint/trigger if exists.
-- =============================================================================

begin;

-- ── development_projects ─────────────────────────────────────────────────────
create table if not exists public.development_projects (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners (id) on delete set null,
  ownership_status text not null default 'unclaimed'
    check (ownership_status in ('unclaimed', 'claimed')),
  source_owner text,
  source_key text not null unique,
  slug text not null unique,
  name text not null,
  city text,
  neighborhood text,
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  project_status text
    check (project_status is null or project_status in (
      'pre_launch', 'pre_sale', 'under_construction', 'delivered', 'sold_out'
    )),
  publish_state text not null default 'draft'
    check (publish_state in ('draft', 'published', 'archived')),
  price_from_cents bigint,
  price_to_cents bigint,
  currency text not null default 'COP',
  expected_delivery_year smallint,
  expected_delivery_quarter smallint
    check (expected_delivery_quarter is null or expected_delivery_quarter between 1 and 4),
  delivery_note text,
  vis_flag boolean,
  construction_progress smallint
    check (construction_progress is null or construction_progress between 0 and 100),
  payment_plan text,
  amenities text[],
  source_kind text
    check (source_kind is null or source_kind in (
      'developer', 'government', 'marketplace', 'aggregator'
    )),
  source_url text,
  primary_source_id uuid,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_projects_coordinate_pair_check check (
    (latitude is null and longitude is null)
    or (
      latitude is not null
      and longitude is not null
      and latitude between -90 and 90
      and longitude between -180 and 180
    )
  ),
  constraint development_projects_price_range_check check (
    price_from_cents is null
    or price_to_cents is null
    or price_to_cents >= price_from_cents
  ),
  constraint development_projects_ownership_partner_check check (
    (ownership_status = 'unclaimed' and partner_id is null)
    or (ownership_status = 'claimed' and partner_id is not null)
  ),
  constraint development_projects_published_requires_provenance_check check (
    publish_state <> 'published' or verified_at is not null
  )
);

comment on table public.development_projects is
  'SAN-1385: canonical New Projects inventory. partner_id is nullable and becomes the operational owner only when ownership_status = claimed (D1).';

create index if not exists idx_development_projects_partner
  on public.development_projects (partner_id)
  where partner_id is not null;
create index if not exists idx_development_projects_publish
  on public.development_projects (publish_state, city, neighborhood);
create index if not exists idx_development_projects_status
  on public.development_projects (project_status)
  where project_status is not null;

-- ── development_unit_types ───────────────────────────────────────────────────
create table if not exists public.development_unit_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.development_projects (id) on delete cascade,
  source_key text not null,
  name text not null,
  bedrooms smallint,
  bathrooms numeric(3, 1),
  built_area_m2 numeric(8, 2),
  private_area_m2 numeric(8, 2),
  price_from_cents bigint,
  price_to_cents bigint,
  currency text not null default 'COP',
  availability text
    check (availability is null or availability in ('available', 'limited', 'sold_out')),
  floor_plan_url text,
  media_url text,
  source_kind text
    check (source_kind is null or source_kind in (
      'developer', 'government', 'marketplace', 'aggregator'
    )),
  source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_unit_types_price_range_check check (
    price_from_cents is null
    or price_to_cents is null
    or price_to_cents >= price_from_cents
  ),
  constraint development_unit_types_project_source_key unique (project_id, source_key)
);

comment on table public.development_unit_types is
  'SAN-1385: project-level typologies. Exact unit inventory is intentionally not modelled (no development_units); unknown values stay null.';

create index if not exists idx_development_unit_types_project
  on public.development_unit_types (project_id);

-- ── development_project_sources ──────────────────────────────────────────────
create table if not exists public.development_project_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.development_projects (id) on delete cascade,
  source_url text not null,
  source_type text not null
    check (source_type in ('developer', 'government', 'marketplace', 'aggregator')),
  scope text not null default 'project'
    check (scope in ('project', 'listing')),
  http_status smallint,
  checked_at timestamptz,
  source_updated_at timestamptz,
  fact_status text not null default 'confirmed'
    check (fact_status in ('confirmed', 'unknown', 'conflict')),
  confidence text
    check (confidence is null or confidence in ('A', 'B', 'C')),
  notes text,
  observed_facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_project_sources_url_key unique (project_id, source_url)
);

comment on table public.development_project_sources is
  'SAN-1385 D2: multi-source, conflict-preserving provenance. Conflicting facts stay as separate rows; never blend them.';

create index if not exists idx_development_project_sources_project
  on public.development_project_sources (project_id);

-- Denormalized convenience pointer (not the source of truth).
alter table public.development_projects
  drop constraint if exists development_projects_primary_source_id_fkey;
alter table public.development_projects
  add constraint development_projects_primary_source_id_fkey
  foreign key (primary_source_id)
  references public.development_project_sources (id)
  on delete set null;

-- ── updated_at triggers ──────────────────────────────────────────────────────
drop trigger if exists development_projects_set_updated_at on public.development_projects;
create trigger development_projects_set_updated_at
  before update on public.development_projects
  for each row execute function public.set_updated_at();

drop trigger if exists development_unit_types_set_updated_at on public.development_unit_types;
create trigger development_unit_types_set_updated_at
  before update on public.development_unit_types
  for each row execute function public.set_updated_at();

drop trigger if exists development_project_sources_set_updated_at on public.development_project_sources;
create trigger development_project_sources_set_updated_at
  before update on public.development_project_sources
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.development_projects enable row level security;
alter table public.development_unit_types enable row level security;
alter table public.development_project_sources enable row level security;

-- development_projects: public read of published projects only.
drop policy if exists development_projects_select_published_anon on public.development_projects;
create policy development_projects_select_published_anon
  on public.development_projects for select to anon
  using (publish_state = 'published');

drop policy if exists development_projects_select_published_authenticated on public.development_projects;
create policy development_projects_select_published_authenticated
  on public.development_projects for select to authenticated
  using (publish_state = 'published');

drop policy if exists development_projects_select_partner_member on public.development_projects;
create policy development_projects_select_partner_member
  on public.development_projects for select to authenticated
  using (partner_id in (select public.partner_ids_for_user()));

drop policy if exists development_projects_insert_partner_member on public.development_projects;
create policy development_projects_insert_partner_member
  on public.development_projects for insert to authenticated
  with check (
    partner_id in (select public.partner_ids_for_user())
    and ownership_status = 'claimed'
  );

drop policy if exists development_projects_update_partner_member on public.development_projects;
create policy development_projects_update_partner_member
  on public.development_projects for update to authenticated
  using (partner_id in (select public.partner_ids_for_user()))
  with check (
    partner_id in (select public.partner_ids_for_user())
    and ownership_status = 'claimed'
  );

drop policy if exists development_projects_delete_admin on public.development_projects;
create policy development_projects_delete_admin
  on public.development_projects for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists development_projects_insert_admin on public.development_projects;
create policy development_projects_insert_admin
  on public.development_projects for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists development_projects_update_admin on public.development_projects;
create policy development_projects_update_admin
  on public.development_projects for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists development_projects_service_role on public.development_projects;
create policy development_projects_service_role
  on public.development_projects for all to service_role
  using (true) with check (true);

-- development_unit_types: read where the parent project is readable.
drop policy if exists development_unit_types_select_published_anon on public.development_unit_types;
create policy development_unit_types_select_published_anon
  on public.development_unit_types for select to anon
  using (exists (
    select 1 from public.development_projects dp
    where dp.id = development_unit_types.project_id
      and dp.publish_state = 'published'
  ));

drop policy if exists development_unit_types_select_published_authenticated on public.development_unit_types;
create policy development_unit_types_select_published_authenticated
  on public.development_unit_types for select to authenticated
  using (exists (
    select 1 from public.development_projects dp
    where dp.id = development_unit_types.project_id
      and dp.publish_state = 'published'
  ));

drop policy if exists development_unit_types_select_partner_member on public.development_unit_types;
create policy development_unit_types_select_partner_member
  on public.development_unit_types for select to authenticated
  using (exists (
    select 1 from public.development_projects dp
    where dp.id = development_unit_types.project_id
      and dp.partner_id in (select public.partner_ids_for_user())
  ));

drop policy if exists development_unit_types_insert_partner_member on public.development_unit_types;
create policy development_unit_types_insert_partner_member
  on public.development_unit_types for insert to authenticated
  with check (exists (
    select 1 from public.development_projects dp
    where dp.id = development_unit_types.project_id
      and dp.partner_id in (select public.partner_ids_for_user())
  ));

drop policy if exists development_unit_types_update_partner_member on public.development_unit_types;
create policy development_unit_types_update_partner_member
  on public.development_unit_types for update to authenticated
  using (exists (
    select 1 from public.development_projects dp
    where dp.id = development_unit_types.project_id
      and dp.partner_id in (select public.partner_ids_for_user())
  ))
  with check (exists (
    select 1 from public.development_projects dp
    where dp.id = development_unit_types.project_id
      and dp.partner_id in (select public.partner_ids_for_user())
  ));

drop policy if exists development_unit_types_admin on public.development_unit_types;
create policy development_unit_types_admin
  on public.development_unit_types for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists development_unit_types_service_role on public.development_unit_types;
create policy development_unit_types_service_role
  on public.development_unit_types for all to service_role
  using (true) with check (true);

-- development_project_sources: provenance for published projects is public.
drop policy if exists development_project_sources_select_published_anon on public.development_project_sources;
create policy development_project_sources_select_published_anon
  on public.development_project_sources for select to anon
  using (exists (
    select 1 from public.development_projects dp
    where dp.id = development_project_sources.project_id
      and dp.publish_state = 'published'
  ));

drop policy if exists development_project_sources_select_published_authenticated on public.development_project_sources;
create policy development_project_sources_select_published_authenticated
  on public.development_project_sources for select to authenticated
  using (exists (
    select 1 from public.development_projects dp
    where dp.id = development_project_sources.project_id
      and dp.publish_state = 'published'
  ));

drop policy if exists development_project_sources_select_partner_member on public.development_project_sources;
create policy development_project_sources_select_partner_member
  on public.development_project_sources for select to authenticated
  using (exists (
    select 1 from public.development_projects dp
    where dp.id = development_project_sources.project_id
      and dp.partner_id in (select public.partner_ids_for_user())
  ));

drop policy if exists development_project_sources_insert_partner_member on public.development_project_sources;
create policy development_project_sources_insert_partner_member
  on public.development_project_sources for insert to authenticated
  with check (exists (
    select 1 from public.development_projects dp
    where dp.id = development_project_sources.project_id
      and dp.partner_id in (select public.partner_ids_for_user())
  ));

drop policy if exists development_project_sources_update_partner_member on public.development_project_sources;
create policy development_project_sources_update_partner_member
  on public.development_project_sources for update to authenticated
  using (exists (
    select 1 from public.development_projects dp
    where dp.id = development_project_sources.project_id
      and dp.partner_id in (select public.partner_ids_for_user())
  ))
  with check (exists (
    select 1 from public.development_projects dp
    where dp.id = development_project_sources.project_id
      and dp.partner_id in (select public.partner_ids_for_user())
  ));

drop policy if exists development_project_sources_admin on public.development_project_sources;
create policy development_project_sources_admin
  on public.development_project_sources for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists development_project_sources_service_role on public.development_project_sources;
create policy development_project_sources_service_role
  on public.development_project_sources for all to service_role
  using (true) with check (true);

-- ── grants (object reachability is a separate gate from RLS) ──────────────────
-- Supabase's schema default privileges grant ALL (incl. TRUNCATE/TRIGGER/REFERENCES)
-- to anon/authenticated on new tables. Revoke first, then grant only what the app
-- actually exposes. RLS is the row gate; these grants are the object gate.
revoke all on table public.development_projects from anon, authenticated;
grant select on table public.development_projects to anon;
grant select, insert, update, delete on table public.development_projects to authenticated;
grant all on table public.development_projects to service_role;

revoke all on table public.development_unit_types from anon, authenticated;
grant select on table public.development_unit_types to anon;
grant select, insert, update on table public.development_unit_types to authenticated;
grant all on table public.development_unit_types to service_role;

revoke all on table public.development_project_sources from anon, authenticated;
grant select on table public.development_project_sources to anon;
grant select, insert, update on table public.development_project_sources to authenticated;
grant all on table public.development_project_sources to service_role;

commit;
