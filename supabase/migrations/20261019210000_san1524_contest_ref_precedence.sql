-- SAN-1524 · make the contest lookup deterministic when a slug collides with another id
--
-- `contest_public_get` matched `lower(c.slug) = lower(p_ref) OR c.id::text = lower(p_ref)` and then
-- took an arbitrary `limit 1`. A slug is free text and may legally equal another contest's UUID, so
-- both rows could match and the database was free to return either.
--
-- The reference is now compared without casting (so a non-UUID value can never raise 22P02) and the
-- ordering makes an exact id match win over a slug match.

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
      and (lower(c.slug) = ref.value or c.id::text = ref.value)
    order by (c.id::text = ref.value) desc, (lower(c.slug) = ref.value) desc
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
        left join vote.categories cat
          on cat.id = e.category_id
         and cat.contest_id = e.contest_id
        where e.contest_id = t.id
          and e.restaurant_id is not null
      ) rows
    ), '[]'::jsonb)
  )
  from target t;
$$;

revoke all on function public.contest_public_get(text) from public, anon, authenticated;
grant execute on function public.contest_public_get(text) to service_role;
