-- SAN-1526 · Super Admin contest lifecycle, with an audit trail
--
-- The admin dashboard needs to create a contest, add catalog restaurants, and change status.
-- `vote` is private (not in pgrst.db_schemas) so the browser cannot write it; every mutation
-- is a server action that has already checked the session, calling one of these service-role
-- RPCs. Each RPC re-checks the actor (defence in depth) and writes exactly one audit row in
-- the same transaction as the mutation, so a failed write leaves neither.
--
-- Idempotency: a repeated call with the same p_request_id returns the first result instead of
-- creating a second contest/entry.

-- ── 1. Audit table ────────────────────────────────────────────────────────────────
-- No existing table records who changed a contest. RLS is enabled with NO policies: that is
-- an explicit deny-all for every role, and service_role bypasses it. The schema itself is
-- also unreachable from the browser.
create table if not exists vote.contest_audit (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references vote.contests(id) on delete cascade,
  actor_user_id uuid not null,
  action text not null,
  origin text not null default 'manual' check (origin in ('manual', 'ai')),
  before jsonb,
  after jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists vote_contest_audit_contest_idx
  on vote.contest_audit (contest_id, created_at desc);

create unique index if not exists vote_contest_audit_request_idx
  on vote.contest_audit (request_id) where request_id is not null;

alter table vote.contest_audit enable row level security;
revoke all on vote.contest_audit from public, anon, authenticated;

-- ── 2. Helpers ───────────────────────────────────────────────────────────────────
create or replace function public.assert_contest_admin(p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null then
    raise exception 'actor required' using errcode = '42501';
  end if;
  if not (public.has_role(p_actor, 'admin'::public.user_role)
       or public.has_role(p_actor, 'super_admin'::public.user_role)) then
    raise exception 'admin role required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.contest_audit_insert(
  p_actor uuid, p_contest_id uuid, p_action text,
  p_before jsonb, p_after jsonb, p_origin text, p_request_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into vote.contest_audit (contest_id, actor_user_id, action, origin, before, after, request_id)
  values (p_contest_id, p_actor, p_action, coalesce(nullif(p_origin, ''), 'manual'), p_before, p_after, p_request_id);
$$;

revoke all on function public.assert_contest_admin(uuid) from public, anon, authenticated;
revoke all on function public.contest_audit_insert(uuid, uuid, text, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.assert_contest_admin(uuid) to service_role;
grant execute on function public.contest_audit_insert(uuid, uuid, text, jsonb, jsonb, text, text) to service_role;
-- ── 3. Read RPCs ────────────────────────────────────────────────────────────────
create or replace function public.admin_contest_list(p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare v_out jsonb;
begin
  perform public.assert_contest_admin(p_actor);
  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'title', c.title, 'status', c.status, 'kind', c.kind,
      'starts_at', c.starts_at, 'ends_at', c.ends_at, 'created_at', c.created_at,
      'entries', (select count(*) from vote.entities e where e.contest_id = c.id),
      'linked', (select count(*) from vote.entities e where e.contest_id = c.id and e.restaurant_id is not null)
    ) as row
    from vote.contests c
    where c.kind = 'restaurant'
  ) s;
  return v_out;
end;
$$;

create or replace function public.admin_contest_get(p_actor uuid, p_contest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare v_contest jsonb; v_entries jsonb; v_audit jsonb;
begin
  perform public.assert_contest_admin(p_actor);
  select jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'title', c.title, 'description', c.description,
    'status', c.status, 'kind', c.kind, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
    'created_at', c.created_at, 'updated_at', c.updated_at
  ) into v_contest
  from vote.contests c where c.id = p_contest_id;

  if v_contest is null then
    raise exception 'contest not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entity_id', e.id, 'restaurant_id', e.restaurant_id, 'display_name', e.display_name,
    'approved', e.approved, 'ballots', (select count(*) from vote.votes v where v.entity_id = e.id)
  ) order by e.created_at), '[]'::jsonb) into v_entries
  from vote.entities e where e.contest_id = p_contest_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'action', a.action, 'origin', a.origin, 'actor', a.actor_user_id,
    'created_at', a.created_at, 'before', a.before, 'after', a.after
  ) order by a.created_at desc), '[]'::jsonb) into v_audit
  from (select * from vote.contest_audit where contest_id = p_contest_id order by created_at desc limit 20) a;

  return jsonb_build_object('contest', v_contest, 'entries', v_entries, 'audit', v_audit);
end;
$$;

-- ── 4. Mutations ────────────────────────────────────────────────────────────────
create or replace function public.admin_contest_create(
  p_actor uuid, p_title text, p_slug text default null, p_description text default null,
  p_starts_at timestamptz default now(), p_ends_at timestamptz default now() + interval '120 days',
  p_origin text default 'manual', p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_slug text; v_after jsonb; v_existing jsonb;
begin
  perform public.assert_contest_admin(p_actor);

  if p_request_id is not null then
    select a.after into v_existing from vote.contest_audit a where a.request_id = p_request_id limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'title required' using errcode = '22023';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;

  v_slug := coalesce(nullif(btrim(coalesce(p_slug, '')), ''),
                     lower(regexp_replace(btrim(p_title), '[^a-zA-Z0-9]+', '-', 'g')));
  if exists (select 1 from vote.contests c where c.slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into vote.contests (slug, kind, title, description, org_id, starts_at, ends_at, status)
  values (v_slug, 'restaurant', btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''),
          p_actor, p_starts_at, p_ends_at, 'draft')
  returning id into v_id;

  v_after := jsonb_build_object('contest_id', v_id, 'slug', v_slug, 'title', btrim(p_title), 'status', 'draft');
  perform public.contest_audit_insert(p_actor, v_id, 'contest.create', null, v_after, p_origin, p_request_id);
  return v_after;
end;
$$;
create or replace function public.admin_contest_update(
  p_actor uuid, p_contest_id uuid,
  p_title text default null, p_description text default null, p_status text default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null,
  p_origin text default 'manual', p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_before jsonb; v_after jsonb; v_existing jsonb;
        v_status text; v_starts timestamptz; v_ends timestamptz;
begin
  perform public.assert_contest_admin(p_actor);

  if p_request_id is not null then
    select a.after into v_existing from vote.contest_audit a where a.request_id = p_request_id limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  select c.status, c.starts_at, c.ends_at into v_status, v_starts, v_ends
  from vote.contests c where c.id = p_contest_id;
  if v_status is null then
    raise exception 'contest not found' using errcode = 'P0002';
  end if;

  v_status := coalesce(nullif(btrim(coalesce(p_status, '')), ''), v_status);
  if v_status not in ('draft', 'live', 'closed', 'archived') then
    raise exception 'invalid status: %', v_status using errcode = '22023';
  end if;
  v_starts := coalesce(p_starts_at, v_starts);
  v_ends := coalesce(p_ends_at, v_ends);
  if v_ends <= v_starts then
    raise exception 'ends_at must be after starts_at' using errcode = '22023';
  end if;

  select jsonb_build_object('title', c.title, 'description', c.description, 'status', c.status,
                            'starts_at', c.starts_at, 'ends_at', c.ends_at)
  into v_before from vote.contests c where c.id = p_contest_id;

  update vote.contests c set
    title = coalesce(nullif(btrim(coalesce(p_title, '')), ''), c.title),
    description = case when p_description is null then c.description
                        else nullif(btrim(p_description), '') end,
    status = v_status, starts_at = v_starts, ends_at = v_ends
  where c.id = p_contest_id;

  select jsonb_build_object('title', c.title, 'description', c.description, 'status', c.status,
                            'starts_at', c.starts_at, 'ends_at', c.ends_at)
  into v_after from vote.contests c where c.id = p_contest_id;

  perform public.contest_audit_insert(p_actor, p_contest_id, 'contest.update', v_before, v_after, p_origin, p_request_id);
  return v_after;
end;
$$;

create or replace function public.admin_contest_link_restaurant(
  p_actor uuid, p_contest_id uuid, p_restaurant_id uuid,
  p_origin text default 'manual', p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_entity uuid; v_name text; v_slug text; v_after jsonb; v_existing jsonb; v_contest uuid;
begin
  perform public.assert_contest_admin(p_actor);

  if p_request_id is not null then
    select a.after into v_existing from vote.contest_audit a where a.request_id = p_request_id limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  select c.id into v_contest from vote.contests c where c.id = p_contest_id;
  if v_contest is null then
    raise exception 'contest not found' using errcode = 'P0002';
  end if;

  select r.name into v_name from public.restaurants r where r.id = p_restaurant_id;
  if v_name is null then
    raise exception 'restaurant not found' using errcode = 'P0002';
  end if;

  select e.id into v_entity from vote.entities e
  where e.contest_id = p_contest_id and e.restaurant_id = p_restaurant_id;
  if v_entity is not null then
    return jsonb_build_object('entity_id', v_entity, 'restaurant_id', p_restaurant_id, 'already_linked', true);
  end if;

  v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into vote.entities (contest_id, slug, display_name, restaurant_id, approved, created_by_user_id)
  values (p_contest_id, v_slug, v_name, p_restaurant_id, true, p_actor)
  returning id into v_entity;

  v_after := jsonb_build_object('entity_id', v_entity, 'restaurant_id', p_restaurant_id, 'restaurant_name', v_name);
  perform public.contest_audit_insert(p_actor, p_contest_id, 'contest.entry.link', null, v_after, p_origin, p_request_id);
  return v_after;
end;
$$;

create or replace function public.admin_contest_unlink_restaurant(
  p_actor uuid, p_contest_id uuid, p_restaurant_id uuid,
  p_origin text default 'manual', p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_entity uuid; v_ballots bigint; v_after jsonb; v_existing jsonb;
begin
  perform public.assert_contest_admin(p_actor);

  if p_request_id is not null then
    select a.after into v_existing from vote.contest_audit a where a.request_id = p_request_id limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  select e.id into v_entity from vote.entities e
  where e.contest_id = p_contest_id and e.restaurant_id = p_restaurant_id;
  if v_entity is null then
    raise exception 'entry not linked' using errcode = 'P0002';
  end if;

  -- Unlink, never delete: the entry and its ballots must survive, and re-linking is reversible.
  select count(*) into v_ballots from vote.votes v where v.entity_id = v_entity;
  update vote.entities e set restaurant_id = null where e.id = v_entity;

  v_after := jsonb_build_object('entity_id', v_entity, 'restaurant_id', p_restaurant_id,
                                'unlinked', true, 'ballots_preserved', v_ballots);
  perform public.contest_audit_insert(p_actor, p_contest_id, 'contest.entry.unlink', null, v_after, p_origin, p_request_id);
  return v_after;
end;
$$;

-- ── 5. Privileges: service_role only ────────────────────────────────────────────
revoke all on function public.admin_contest_list(uuid) from public, anon, authenticated;
revoke all on function public.admin_contest_get(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_contest_create(uuid, text, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.admin_contest_update(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.admin_contest_link_restaurant(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_contest_unlink_restaurant(uuid, uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.admin_contest_list(uuid) to service_role;
grant execute on function public.admin_contest_get(uuid, uuid) to service_role;
grant execute on function public.admin_contest_create(uuid, text, text, text, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.admin_contest_update(uuid, uuid, text, text, text, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.admin_contest_link_restaurant(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.admin_contest_unlink_restaurant(uuid, uuid, uuid, text, text) to service_role;