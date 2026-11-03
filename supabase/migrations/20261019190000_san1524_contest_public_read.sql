-- SAN-1524 · public read surface for restaurant contests
--
-- `vote` is not exposed to PostgREST, so a public page cannot read it from the browser. These two
-- functions are the only public read path: service-role only, allowlisted fields, and no voter data.
--
-- The stored status is returned as-is; the effective "open / closed / upcoming" state is derived in
-- the application from the status AND the clock, because a draft whose end date passed is not open.

create or replace function public.contest_public_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(row order by is_live desc, starts_at desc nulls last),
    '[]'::jsonb
  )
  from (
    select
      jsonb_build_object(
        'id', contest.id,
        'slug', contest.slug,
        'title', contest.title,
        'description', contest.description,
        'status', contest.status,
        'starts_at', contest.starts_at,
        'ends_at', contest.ends_at,
        'cover_url', contest.cover_url,
        'nominees', (select count(*) from vote.entities e
                      where e.contest_id = contest.id and e.restaurant_id is not null)
      ) as row,
      (contest.status = 'live') as is_live,
      contest.starts_at
    from vote.contests contest
    where contest.kind = 'restaurant'
  ) ordered;
$$;

create or replace function public.contest_public_get(p_ref text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select c.id, c.slug, c.title, c.description, c.status, c.starts_at, c.ends_at, c.cover_url
    from vote.contests c
    where c.kind = 'restaurant'
      and (c.slug = p_ref or c.id::text = lower(p_ref))
    limit 1
  )
  select jsonb_build_object(
    'contest', jsonb_build_object(
      'id', t.id,
      'slug', t.slug,
      'title', t.title,
      'description', t.description,
      'status', t.status,
      'starts_at', t.starts_at,
      'ends_at', t.ends_at,
      'cover_url', t.cover_url
    ),
    'nominees', coalesce((
      select jsonb_agg(n order by n ->> 'restaurant_name')
      from (
        select jsonb_build_object(
          'entity_id', e.id,
          'restaurant_id', e.restaurant_id,
          'restaurant_name', r.name,
          'neighborhood', r.neighborhood,
          'image_url', r.primary_image_url,
          'category', cat.title
        ) as n
        from vote.entities e
        join public.restaurants r on r.id = e.restaurant_id
        left join vote.categories cat on cat.id = e.category_id
        where e.contest_id = t.id
          and e.restaurant_id is not null
      ) rows
    ), '[]'::jsonb)
  )
  from target t;
$$;

revoke all on function public.contest_public_list() from public, anon, authenticated;
revoke all on function public.contest_public_get(text) from public, anon, authenticated;
grant execute on function public.contest_public_list() to service_role;
grant execute on function public.contest_public_get(text) to service_role;
