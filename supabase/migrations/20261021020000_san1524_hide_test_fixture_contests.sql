-- SAN-1524 · stop showing technical test fixtures to visitors
--
-- /contests listed two harness contests ("[DEV TEST] E2E — do not publish" and
-- "[DEV TEST] Restaurant Voting Smoke") on the public site. The data was honest; the page was not.
--
-- Rather than matching titles, this adds the explicit marker the rest of the platform already uses
-- for development fixtures (`is_test_fixture`), sets it on the two known harness contests, and
-- excludes marked rows from the public read only. Admin RPCs read vote.contests directly, and the
-- vote path resolves through vote_restaurant_target, so fixtures stay usable for E2E and QA.

alter table vote.contests
  add column if not exists is_test_fixture boolean not null default false;

comment on column vote.contests.is_test_fixture is
  'True for harness/QA contests. Excluded from the public contest read; still addressable by admin and voting paths.';

update vote.contests
   set is_test_fixture = true
 where slug in ('dev-test-e2e-do-not-publish', 'mde-dev-smoke-san1521');

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
      and not contest.is_test_fixture
  ) ordered;
$$;

create or replace function public.contest_public_get(p_ref text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ref as (
    select lower(btrim(p_ref)) as value
  ),
  target as (
    select c.id, c.slug, c.title, c.description, c.status, c.starts_at, c.ends_at, c.cover_url
    from vote.contests c, ref
    where c.kind = 'restaurant'
      and not c.is_test_fixture
      and (lower(c.slug) = ref.value or c.id::text = ref.value)
    order by (c.id::text = ref.value) desc, (lower(c.slug) = ref.value) desc
    limit 1
  )
  select jsonb_build_object(
    'contest', jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'title', t.title, 'description', t.description,
      'status', t.status, 'starts_at', t.starts_at, 'ends_at', t.ends_at, 'cover_url', t.cover_url
    ),
    'nominees', coalesce((
      select jsonb_agg(n order by n ->> 'restaurant_name')
      from (
        select jsonb_build_object(
          'entity_id', e.id, 'restaurant_id', e.restaurant_id,
          'restaurant_name', r.name, 'neighborhood', r.neighborhood,
          'image_url', r.primary_image_url, 'category', cat.title
        ) as n
        from vote.entities e
        join public.restaurants r on r.id = e.restaurant_id
        left join vote.categories cat on cat.id = e.category_id and cat.contest_id = e.contest_id
        where e.contest_id = t.id and e.restaurant_id is not null
      ) rows
    ), '[]'::jsonb)
  )
  from target t;
$$;

revoke all on function public.contest_public_list() from public, anon, authenticated;
revoke all on function public.contest_public_get(text) from public, anon, authenticated;
grant execute on function public.contest_public_list() to service_role;
grant execute on function public.contest_public_get(text) to service_role;