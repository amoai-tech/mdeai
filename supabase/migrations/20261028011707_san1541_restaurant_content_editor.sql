-- SAN-1541 · Restaurant content editor: structured menu items + owner photo uploads
--
-- SCOPE
-- * One minimal menu model (section, item, price, currency, position, source URL).
--   public.restaurants already stores images/primary_image_url/hours_of_operation,
--   so those stay on the row and are edited through restaurant_owner_patch.
-- * One public-read storage bucket for listing photos. Uploads are member-scoped by
--   the same server-controlled restaurant -> partner assignment as every other write;
--   the Google Place ID never grants storage access.
--
-- PHASE A: no photo-rights approval, verification or publication gate is added.
-- Source attribution is stored so a photo can always name where it came from.

-- ── 1. Structured menu ────────────────────────────────────────────────────────
create table if not exists public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  section text,
  name text not null,
  description text,
  price_amount numeric(12, 2),
  currency text not null default 'COP',
  position integer not null default 0,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_menu_items_name_check
    check (length(btrim(name)) between 1 and 160),
  constraint restaurant_menu_items_section_check
    check (section is null or length(btrim(section)) between 1 and 80),
  constraint restaurant_menu_items_description_check
    check (description is null or length(description) <= 600),
  constraint restaurant_menu_items_price_check
    check (price_amount is null or (price_amount >= 0 and price_amount <= 100000000)),
  constraint restaurant_menu_items_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint restaurant_menu_items_position_check
    check (position >= 0 and position <= 100000),
  constraint restaurant_menu_items_source_url_check
    check (source_url is null or source_url ~* '^https?://[^[:space:]]+$')
);

comment on table public.restaurant_menu_items is
  'SAN-1541: owner-maintained menu rows for a restaurant. Public read; writes require the parent restaurant to be assigned to the caller''s partner.';

create index if not exists idx_restaurant_menu_items_restaurant
  on public.restaurant_menu_items (restaurant_id, position, created_at);

drop trigger if exists restaurant_menu_items_updated_at on public.restaurant_menu_items;
create trigger restaurant_menu_items_updated_at
  before update on public.restaurant_menu_items
  for each row
  execute function public.update_updated_at();

alter table public.restaurant_menu_items enable row level security;

-- A menu is public listing information. Reads follow the existing public restaurant
-- catalog; no private data is stored here.
drop policy if exists restaurant_menu_items_public_read on public.restaurant_menu_items;
create policy restaurant_menu_items_public_read
  on public.restaurant_menu_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists restaurant_menu_items_partner_insert on public.restaurant_menu_items;
create policy restaurant_menu_items_partner_insert
  on public.restaurant_menu_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id
        and (
          r.partner_id in (select public.partner_ids_for_user())
          or public.is_admin()
        )
    )
  );

drop policy if exists restaurant_menu_items_partner_update on public.restaurant_menu_items;
create policy restaurant_menu_items_partner_update
  on public.restaurant_menu_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id
        and (
          r.partner_id in (select public.partner_ids_for_user())
          or public.is_admin()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id
        and (
          r.partner_id in (select public.partner_ids_for_user())
          or public.is_admin()
        )
    )
  );

drop policy if exists restaurant_menu_items_partner_delete on public.restaurant_menu_items;
create policy restaurant_menu_items_partner_delete
  on public.restaurant_menu_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id
        and (
          r.partner_id in (select public.partner_ids_for_user())
          or public.is_admin()
        )
    )
  );

drop policy if exists restaurant_menu_items_service_role on public.restaurant_menu_items;
create policy restaurant_menu_items_service_role
  on public.restaurant_menu_items
  to service_role
  using (true)
  with check (true);

revoke all on table public.restaurant_menu_items from public, anon, authenticated;
grant select on table public.restaurant_menu_items to anon, authenticated;
grant insert, update, delete on table public.restaurant_menu_items to authenticated;
grant all on table public.restaurant_menu_items to service_role;

-- ── 2. Owner photo uploads (public bucket, member-scoped writes) ──────────────
-- Path shape: restaurant-photos/{partner_id}/{restaurant_id}/{uuid}.{ext}
-- Folder 1 is the partner id, so the storage policy and public.restaurants.partner_id
-- agree on the same server-controlled authority.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-photos',
  'restaurant-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists restaurant_photos_storage_insert on storage.objects;
create policy restaurant_photos_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'restaurant-photos'
    and (storage.foldername(name))[1] in (
      select pid::text from public.partner_ids_for_user() as pid
    )
  );

drop policy if exists restaurant_photos_storage_update on storage.objects;
create policy restaurant_photos_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'restaurant-photos'
    and (storage.foldername(name))[1] in (
      select pid::text from public.partner_ids_for_user() as pid
    )
  )
  with check (
    bucket_id = 'restaurant-photos'
    and (storage.foldername(name))[1] in (
      select pid::text from public.partner_ids_for_user() as pid
    )
  );

drop policy if exists restaurant_photos_storage_delete on storage.objects;
create policy restaurant_photos_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'restaurant-photos'
    and (storage.foldername(name))[1] in (
      select pid::text from public.partner_ids_for_user() as pid
    )
  );

drop policy if exists restaurant_photos_storage_service_role on storage.objects;
create policy restaurant_photos_storage_service_role
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'restaurant-photos')
  with check (bucket_id = 'restaurant-photos');
