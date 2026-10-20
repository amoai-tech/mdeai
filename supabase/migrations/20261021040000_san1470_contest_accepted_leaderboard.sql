-- SAN-1470 · accepted-audience standings, read through the existing contest RPC
--
-- One server read, no second tally engine: each nominee's counts come from public.vote_tally(),
-- which already excludes development-test ballots from audience_accepted (SAN-1497).
--
-- Rules encoded here:
--   * only accepted votes decide a place; test votes never do;
--   * zero accepted means UNRANKED (place is null), not "tied for first";
--   * ties share a competition rank (2/2/1 -> 1/1/3) because rank() is used, not row_number();
--   * ordering is accepted DESC, then a stable name/id sort that cannot change the rank.

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
  ),
  nominee as (
    select
      e.id as entity_id,
      e.restaurant_id,
      r.name as restaurant_name,
      r.neighborhood,
      r.primary_image_url as image_url,
      cat.title as category,
      coalesce((public.vote_tally(e.id) ->> 'audience_accepted')::int, 0) as accepted,
      coalesce((public.vote_tally(e.id) ->> 'development_test_total')::int, 0) as development
    from vote.entities e
    join target t on t.id = e.contest_id
    join public.restaurants r on r.id = e.restaurant_id
    left join vote.categories cat
      on cat.id = e.category_id
     and cat.contest_id = e.contest_id
    where e.restaurant_id is not null
  ),
  ranked as (
    select nominee.*,
      case when accepted > 0 then rank() over (order by accepted desc) end as place
    from nominee
  )
  select jsonb_build_object(
    'contest', (
      select jsonb_build_object(
        'id', t.id, 'slug', t.slug, 'title', t.title, 'description', t.description,
        'status', t.status, 'starts_at', t.starts_at, 'ends_at', t.ends_at, 'cover_url', t.cover_url
      )
      from target t
    ),
    'nominees', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entity_id', entity_id,
          'restaurant_id', restaurant_id,
          'restaurant_name', restaurant_name,
          'neighborhood', neighborhood,
          'image_url', image_url,
          'category', category,
          'audience_accepted', accepted,
          'development_test_total', development,
          'rank', place
        )
        order by accepted desc, lower(restaurant_name), entity_id
      )
      from ranked
    ), '[]'::jsonb)
  )
  -- No matching contest must be SQL NULL, not an object with a null contest. Callers and the
  -- existing "a pageant is not reachable" assertion both depend on that contract.
  where exists (select 1 from target);
$$;

revoke all on function public.contest_public_get(text) from public, anon, authenticated;
grant execute on function public.contest_public_get(text) to service_role;

comment on function public.contest_public_get(text) is
  'Public contest read with accepted-audience standings. Rank is null at zero accepted votes; ties share a competition rank.';