-- =============================================================================
-- Migration: 20261011090000_san1431_material_edit_guard.sql
-- Task:      SAN-1431 §4.2 — material edits after publication must re-enter review
-- =============================================================================
-- A published, verified listing could keep its verified/requestable state after a
-- broker changed a material fact (price, availability, address/neighborhood/
-- coordinates, ownership, images or verification evidence). The gate only runs at
-- publication, so a changed fact could still appear approved and requestable.
--
-- This adds a database-level guard: any material change to a live listing fails
-- closed — it drops to draft/inactive/pending with verified=false, publication is
-- cleared, and the reason + time are recorded for trusted review. Initial publish/re-publish operations from non-live rows are left
-- intact, while combined workflow + material edits from live rows fail closed. Harmless copy edits (title/description/amenities) do not
-- disrupt a listing.
--
-- Reuses the existing model only: apartments, property_verifications,
-- rental_listing_images, workflow_changed_by/at and the workflow status fields.
-- No new approval system, table or readiness predicate.
-- =============================================================================

-- 1 · Demote a live listing to review. Guard-trigger only; not client-callable.
create or replace function public.demote_published_listing_for_review(
  p_apartment_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.apartments;
begin
  select * into v_row from public.apartments where id = p_apartment_id for update;
  if not found then return; end if;

  if v_row.listing_workflow_status = 'published'
     or (v_row.status = 'active' and v_row.moderation_status = 'approved') then
    update public.apartments
       set listing_workflow_status = 'draft',
           status = 'inactive',
           moderation_status = 'pending',
           verified = false,
           published_at = null,
           published_by = null,
           workflow_changed_by = (select auth.uid()),
           workflow_changed_at = now(),
           updated_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'review_required_reason', p_reason,
             'review_required_at', now(),
             -- DB role is diagnostic provenance, NEVER a human UUID.
             'review_actor_kind', case
               when auth.uid() is not null then 'authenticated_user'
               when current_setting('role', true) = 'service_role' then 'service_role'
               else 'database_operation'
             end,
             'review_actor_db_role', coalesce(
               nullif(current_setting('role', true), ''), current_user
             )
           )
     where id = p_apartment_id;
  end if;
end;
$$;

revoke all on function public.demote_published_listing_for_review(uuid, text)
  from public, anon, authenticated;
grant execute on function public.demote_published_listing_for_review(uuid, text)
  to service_role;

-- 2 · Guard apartments content edits.
create or replace function public.apartments_material_edit_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_material boolean := false;
  v_already_safe boolean;
  v_reason text;
begin
  -- Only OLD live rows need re-review. Initial publishing/republishing starts
  -- from a non-live OLD row, so publish_verified_rental() remains untouched.
  -- Never skip a material edit merely because the UPDATE also changes workflow.
  if OLD.listing_workflow_status = 'published'
     or (OLD.status = 'active' and OLD.moderation_status = 'approved') then
    v_material :=
         (NEW.price_monthly is distinct from OLD.price_monthly)
      or (NEW.price_weekly is distinct from OLD.price_weekly)
      or (NEW.price_daily is distinct from OLD.price_daily)
      or (NEW.currency is distinct from OLD.currency)
      or (NEW.deposit_amount is distinct from OLD.deposit_amount)
      or (NEW.utilities_included is distinct from OLD.utilities_included)
      or (NEW.available_from is distinct from OLD.available_from)
      or (NEW.available_to is distinct from OLD.available_to)
      or (NEW.minimum_stay_days is distinct from OLD.minimum_stay_days)
      or (NEW.maximum_stay_days is distinct from OLD.maximum_stay_days)
      or (NEW.address is distinct from OLD.address)
      or (NEW.neighborhood is distinct from OLD.neighborhood)
      or (NEW.city is distinct from OLD.city)
      or (NEW.latitude is distinct from OLD.latitude)
      or (NEW.longitude is distinct from OLD.longitude)
      -- A null owner is left to the SAN-1349 CHECK, which rejects it outright;
      -- a non-null ownership transfer is material and re-enters review.
      or (NEW.landlord_id is distinct from OLD.landlord_id and NEW.landlord_id is not null)
      or (NEW.bedrooms is distinct from OLD.bedrooms)
      or (NEW.bathrooms is distinct from OLD.bathrooms)
      or (NEW.size_sqm is distinct from OLD.size_sqm)
      or (NEW.floor_number is distinct from OLD.floor_number)
      or (NEW.total_floors is distinct from OLD.total_floors)
      or (NEW.wifi_speed is distinct from OLD.wifi_speed)
      or (NEW.building_amenities is distinct from OLD.building_amenities)
      or (NEW.video_url is distinct from OLD.video_url)
      or (NEW.virtual_tour_url is distinct from OLD.virtual_tour_url)
      or (NEW.source_url is distinct from OLD.source_url)
      or (NEW.source_listing_id is distinct from OLD.source_listing_id)
      or (NEW.furnished is distinct from OLD.furnished)
      or (NEW.pet_friendly is distinct from OLD.pet_friendly)
      or (NEW.smoking_allowed is distinct from OLD.smoking_allowed)
      or (NEW.parking_included is distinct from OLD.parking_included)
      or (NEW.images is distinct from OLD.images)
      -- Explicitly exempt one non-authoritative note key. All other metadata
      -- changes (including unknown keys) fail closed.
      or ((coalesce(NEW.metadata, '{}'::jsonb) - 'internal_note')
          is distinct from (coalesce(OLD.metadata, '{}'::jsonb) - 'internal_note'));
  end if;

  if v_material then
    -- The evidence AFTER triggers intentionally update the parent to a safe
    -- draft and provide a specific reason. Preserve that reason; do not turn
    -- it into the generic apartment-edit reason on the nested BEFORE trigger.
    v_already_safe := NEW.listing_workflow_status = 'draft'
                  and NEW.status = 'inactive'
                  and NEW.moderation_status = 'pending'
                  and NEW.verified = false
                  and NEW.published_at is null
                  and NEW.published_by is null;
    v_reason := case
      when v_already_safe
       and nullif(NEW.metadata->>'review_required_reason', '') is distinct from
           nullif(OLD.metadata->>'review_required_reason', '')
      then NEW.metadata->>'review_required_reason'
      else 'material edit after publication'
    end;

    NEW.listing_workflow_status := 'draft';
    NEW.status := 'inactive';
    NEW.moderation_status := 'pending';
    NEW.verified := false;
    NEW.published_at := null;
    NEW.published_by := null;
    -- A missing JWT must never be replaced by a fabricated human UUID.
    NEW.workflow_changed_by := auth.uid();
    NEW.workflow_changed_at := now();
    NEW.updated_at := now();
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'review_required_reason', v_reason,
      'review_required_at', now(),
      'review_actor_kind', case
        when auth.uid() is not null then 'authenticated_user'
        when current_setting('role', true) = 'service_role' then 'service_role'
        else 'database_operation'
      end,
      'review_actor_db_role', coalesce(
        nullif(current_setting('role', true), ''), current_user
      )
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists apartments_material_edit_guard on public.apartments;
create trigger apartments_material_edit_guard
  before update on public.apartments
  for each row execute function public.apartments_material_edit_guard();

revoke all on function public.apartments_material_edit_guard() from public, anon, authenticated;
grant execute on function public.apartments_material_edit_guard() to service_role;

-- 3 · Guard image evidence changes.
create or replace function public.rental_listing_images_review_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.demote_published_listing_for_review(
      OLD.listing_id, 'image evidence changed after publication'
    );
    return OLD;
  end if;
  perform public.demote_published_listing_for_review(
    NEW.listing_id, 'image evidence changed after publication'
  );
  if TG_OP = 'UPDATE' and OLD.listing_id is distinct from NEW.listing_id then
    perform public.demote_published_listing_for_review(
      OLD.listing_id, 'image moved away after publication'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists rental_listing_images_review_guard on public.rental_listing_images;
create trigger rental_listing_images_review_guard
  after insert or update or delete on public.rental_listing_images
  for each row execute function public.rental_listing_images_review_guard();

revoke all on function public.rental_listing_images_review_guard() from public, anon, authenticated;
grant execute on function public.rental_listing_images_review_guard() to service_role;

-- 4 · Guard property-verification changes.
create or replace function public.property_verifications_review_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.demote_published_listing_for_review(
      OLD.apartment_id, 'property verification changed after publication'
    );
    return OLD;
  end if;
  perform public.demote_published_listing_for_review(
    NEW.apartment_id, 'property verification changed after publication'
  );
  if OLD.apartment_id is distinct from NEW.apartment_id then
    perform public.demote_published_listing_for_review(
      OLD.apartment_id, 'property verification moved away after publication'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists property_verifications_review_guard on public.property_verifications;
-- UPDATE/DELETE only: a first INSERT is the normal recording path for a listing
-- that could not have been published without it. Changing or removing existing
-- verification evidence is what must re-enter review.
create trigger property_verifications_review_guard
  after update or delete on public.property_verifications
  for each row execute function public.property_verifications_review_guard();

revoke all on function public.property_verifications_review_guard() from public, anon, authenticated;
grant execute on function public.property_verifications_review_guard() to service_role;
