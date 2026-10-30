-- SAN-351 / SAN-1234: reuse public.bookings and public.payments for apartments.
-- Phase A development: no business approval or verification prerequisites.
-- Do not treat client-created price/status as a payable quote; SAN-1240 must
-- derive the amount on the server and finalize via a verified Stripe webhook.
-- Existing booking_type is 'apartment', not 'rental'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_apartment_idempotency
  ON public.bookings (user_id, idempotency_key)
  WHERE booking_type = 'apartment'::public.booking_type
    AND idempotency_key IS NOT NULL;

-- A renter can read their own apartment payment. Keep the existing event-order
-- SELECT policy and its independent event authorization unchanged.
CREATE POLICY payments_apartment_booking_owner_select
  ON public.payments
  FOR SELECT TO authenticated
  USING (
    booking_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = payments.booking_id
        AND b.booking_type = 'apartment'::public.booking_type
        AND b.user_id = (SELECT auth.uid())
    )
  );

-- The existing bookings owner UPDATE policy permits changing payment_status,
-- price and confirmation fields. Protect only apartment commerce here so
-- existing event-venue proposal/admin workflows are unaffected.
-- Do not use this trigger as a substitute for server-side quote verification.
CREATE FUNCTION public.guard_apartment_booking_payment_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Stripe webhook/authorized backend use service_role. Preserve Super Admin
  -- operational control without making ordinary renters payment authorities.
  IF current_user NOT IN ('authenticated', 'anon')
     OR (current_user = 'authenticated'
         AND COALESCE((SELECT public.is_admin()), false)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.booking_type = 'apartment'::public.booking_type
       AND (
         NEW.status <> 'pending'::public.booking_status
         OR (NEW.payment_status IS NOT NULL
             AND NEW.payment_status <> 'pending'::public.payment_status)
         OR NEW.confirmed_at IS NOT NULL
         OR NEW.payment_reference IS NOT NULL
         OR NEW.payment_method IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'Rental payment and booking confirmation are server controlled'
        USING ERRCODE = '23514';
    END IF;
  ELSIF (
      OLD.booking_type = 'apartment'::public.booking_type
      OR NEW.booking_type = 'apartment'::public.booking_type
    ) AND (
      NEW.booking_type IS DISTINCT FROM OLD.booking_type
      OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
      OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
      OR NEW.confirmation_code IS DISTINCT FROM OLD.confirmation_code
      OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
      OR NEW.total_price IS DISTINCT FROM OLD.total_price
      OR NEW.currency IS DISTINCT FROM OLD.currency
    ) THEN
    RAISE EXCEPTION 'Rental payment, identity and booking status are server controlled'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_apartment_booking_payment_authority()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_apartment_booking_payment_authority
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_apartment_booking_payment_authority();
