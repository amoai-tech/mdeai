-- SAN-351 · Apartment booking approvals are server controlled on UPDATE, not just INSERT.
--
-- The BEFORE INSERT branch already refuses client-supplied partner_notes, but the UPDATE branch
-- only guarded partner_id, so a renter could overwrite the broker's private notes after the fact.
-- This adds partner_notes to the existing UPDATE guard; nothing else changes.
--
-- The approval columns are already protected by the separate guard_booking_partner_decision()
-- trigger, verified by attempting a renter self-approval on the live database.
--
-- The function body below is the currently deployed definition with only that edit.

CREATE OR REPLACE FUNCTION public.guard_apartment_booking_payment_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_owner_cancel boolean := false;
BEGIN
  -- Explicitly trusted backend/database roles and authenticated Super Admin.
  -- This grants no Stripe authority: a signed, idempotent webhook finalizer
  -- is a separate SAN-1240 deliverable.
  IF current_user IN ('service_role', 'postgres')
     OR (current_user = 'authenticated'
         AND COALESCE((SELECT public.is_admin()), false)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.booking_type = 'apartment'::public.booking_type THEN
      -- This BEFORE trigger sorts before generate_booking_confirmation.
      -- Therefore a supplied confirmation_code is distinguishable from
      -- the trusted confirmation generator's later output.
      IF NEW.status IS DISTINCT FROM 'pending'::public.booking_status
         OR NEW.payment_status IS DISTINCT FROM 'pending'::public.payment_status
         OR NEW.confirmation_code IS NOT NULL
         OR NEW.confirmed_at IS NOT NULL
         OR NEW.cancelled_at IS NOT NULL
         OR NEW.payment_reference IS NOT NULL
         OR NEW.payment_method IS NOT NULL
         OR NEW.unit_price IS NOT NULL
         OR NEW.total_price IS NOT NULL
         OR NEW.partner_id IS NOT NULL
         OR NEW.approved_by IS NOT NULL
         OR NEW.approved_at IS NOT NULL
         OR NEW.partner_notes IS NOT NULL
         OR NEW.partner_status IS DISTINCT FROM 'pending'
         OR NEW.currency IS DISTINCT FROM 'USD' THEN
        RAISE EXCEPTION 'Apartment payment, identity and approval state are server controlled'
          USING ERRCODE = '23514';
      END IF;

      -- The shared bookings table defaults to USD for event bookings.
      -- A pending apartment intent has no priced/verified quote yet.
      -- Strip the default rather than persisting invented currency.
      NEW.currency := NULL;
    END IF;

  ELSIF OLD.booking_type = 'apartment'::public.booking_type
        OR NEW.booking_type = 'apartment'::public.booking_type THEN
    -- Preserve the pre-existing renter cancellation path. Only an unpaid
    -- pending apartment can be cancelled directly; settled/refunded cases
    -- need an authorized server operation to keep payment state coherent.
    v_owner_cancel :=
      OLD.booking_type = 'apartment'::public.booking_type
      AND NEW.booking_type = 'apartment'::public.booking_type
      AND OLD.status = 'pending'::public.booking_status
      AND (OLD.payment_status IS NULL
           OR OLD.payment_status = 'pending'::public.payment_status)
      AND NEW.status = 'cancelled'::public.booking_status;

    IF v_owner_cancel THEN
      -- Always record the authoritative time; ignore a client timestamp.
      NEW.cancelled_at := statement_timestamp();
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.booking_type IS DISTINCT FROM OLD.booking_type
       OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
       OR NEW.resource_title IS DISTINCT FROM OLD.resource_title
       OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.start_time IS DISTINCT FROM OLD.start_time
       OR NEW.end_time IS DISTINCT FROM OLD.end_time
       OR NEW.party_size IS DISTINCT FROM OLD.party_size
       OR NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR (NEW.status IS DISTINCT FROM OLD.status AND NOT v_owner_cancel)
       OR (NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at AND NOT v_owner_cancel)
       -- SAN-351: partner_notes is broker-only, exactly like partner_id above. The INSERT branch
       -- already refused it, but UPDATE did not, so a renter could overwrite the broker's notes.
       -- (partner_status / approved_by / approved_at are protected by guard_booking_partner_decision.)
       OR NEW.partner_notes IS DISTINCT FROM OLD.partner_notes
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
       OR NEW.confirmation_code IS DISTINCT FROM OLD.confirmation_code
       OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
       OR NEW.total_price IS DISTINCT FROM OLD.total_price
       OR NEW.currency IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'Apartment payment, identity and booking status are server controlled'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
