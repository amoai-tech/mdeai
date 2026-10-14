-- Allow only administrator-owned TEST-operator bookkeeping to remain
-- non-material on already-published rentals. Preserve every real content,
-- photo, source and ownership re-review trigger from SAN-1431.
-- Changing the deployed 20261011 migration would not update production;
-- this independent migration replaces the same trigger function in place.
-- IMPORTANT: this migration runs BEFORE 20261014120738_admin_rental_test_mode
-- so the operator RPC can never be installed ahead of its guard exemption.

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
      -- Only real administrators can change the four internal TEST-operator
      -- audit keys without reopening an otherwise unchanged published rental.
      -- Other metadata, photo, ownership and material changes still fail closed.
      or (
        case when public.is_admin() then
          (coalesce(NEW.metadata, '{}'::jsonb)
            - 'internal_note'
            - 'admin_test_operator_active'
            - 'admin_test_operator_user_id'
            - 'admin_test_operator_updated_by'
            - 'admin_test_operator_updated_at')
          is distinct from
          (coalesce(OLD.metadata, '{}'::jsonb)
            - 'internal_note'
            - 'admin_test_operator_active'
            - 'admin_test_operator_user_id'
            - 'admin_test_operator_updated_by'
            - 'admin_test_operator_updated_at')
        else
          (coalesce(NEW.metadata, '{}'::jsonb) - 'internal_note')
          is distinct from (coalesce(OLD.metadata, '{}'::jsonb) - 'internal_note')
        end
      );
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
