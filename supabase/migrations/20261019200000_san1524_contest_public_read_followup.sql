-- SAN-1524 · follow-up corrections to the public contest read
--
-- 1. The nominee's category was joined by `cat.id = e.category_id` alone. That is correct today
--    (no entity points at another contest's category) but it lets a mis-assigned category label a
--    nominee from a different contest. The join now also requires `cat.contest_id = e.contest_id`.
-- 2. Slugs are stored lowercase; a visitor who types an uppercase slug got a 404 because the
--    lookup compared case-sensitively. Compares are now case-insensitive on both sides.
--
-- The applied migration is left untouched; this one replaces the function definitions in order.

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
      and (lower(c.slug) = lower(p_ref) or c.id::text = lower(p_ref))
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
        -- The category must belong to THIS contest, not merely match the entity's category id.
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
