BEGIN;
SELECT plan(10);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'bookings'
      AND indexname = 'idx_bookings_apartment_idempotency'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%idempotency_key%'
      AND indexdef ILIKE '%apartment%'
  ),
  'Apartment booking dedupe uses the canonical bookings table'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.bookings'::regclass
      AND tgname = 'guard_apartment_booking_payment_authority'
      AND NOT tgisinternal
  ),
  'Apartment booking payment authority is guarded at the DB boundary'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.guard_apartment_booking_payment_authority()'::regprocedure
      AND prosecdef = false
  ),
  'Payment authority trigger is security invoker'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments'
      AND policyname = 'payments_apartment_booking_owner_select'
      AND cmd = 'SELECT' AND roles @> ARRAY['authenticated']::name[]
  ),
  'Renter payment visibility uses an authenticated read-only policy'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments'
      AND policyname = 'payments_event_order_select'
  ),
  'Existing event-order payment visibility is retained'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bookings'
      AND policyname = 'bookings_admin_update'
  ),
  'Existing Super Admin booking access is retained'
);

SELECT is(
  (SELECT count(*)::int FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'rental_bookings'),
  0,
  'No competing rental_bookings ledger is introduced'
);


-- Transactional behavioral proof: test profile and booking never survive ROLLBACK.
INSERT INTO public.profiles (id, email)
VALUES ('35100000-0000-4000-8000-000000000001', 'san351-booking@example.invalid');

SELECT set_config('request.jwt.claim.sub','35100000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;

DO $behavior$
DECLARE
  v_booking uuid;
  v_denied boolean;
BEGIN
  -- A normal development booking requires no partner approval.
  INSERT INTO public.bookings (
    user_id, booking_type, resource_id, resource_title, start_date, status, idempotency_key
  ) VALUES (
    '35100000-0000-4000-8000-000000000001', 'apartment',
    '35100000-0000-4000-8000-000000000002', 'Development apartment',
    CURRENT_DATE + 1, 'pending', 'san351-qa-repeat'
  ) RETURNING id INTO v_booking;

  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date, status, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, 'pending', 'san351-qa-repeat'
    );
  EXCEPTION WHEN unique_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Duplicate rental booking was permitted'; END IF;

  v_denied := false;
  BEGIN
    UPDATE public.bookings SET payment_status = 'paid' WHERE id = v_booking;
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could mark booking paid'; END IF;

  v_denied := false;
  BEGIN
    UPDATE public.bookings SET total_price = 1 WHERE id = v_booking;
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could rewrite canonical price'; END IF;

  v_denied := false;
  BEGIN
    UPDATE public.bookings SET start_date = CURRENT_DATE + 12 WHERE id = v_booking;
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could change priced stay dates'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date, status,
      total_price, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, 'pending', 1, 'san351-forged-price'
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could insert a made-up price'; END IF;


  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date, status,
      payment_status, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, 'confirmed', 'paid', 'san351-forged-paid'
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could create fake confirmed booking'; END IF;
END;
$behavior$;

RESET ROLE;
SELECT is(
 (SELECT count(*)::int FROM public.bookings WHERE idempotency_key='san351-qa-repeat'), 1,
 'Normal apartment booking works, retry dedupes, and forged payment is rejected'
);

INSERT INTO public.payments (booking_id, amount, currency, status)
SELECT id, 250000, 'COP', 'pending' FROM public.bookings
WHERE idempotency_key = 'san351-qa-repeat';

SET LOCAL ROLE authenticated;
DO $owner$
BEGIN
  IF (SELECT count(*) FROM public.payments
      WHERE booking_id IN (SELECT id FROM public.bookings
                           WHERE idempotency_key='san351-qa-repeat')) <> 1 THEN
    RAISE EXCEPTION 'Renter cannot read own booking-linked payment';
  END IF;
END;
$owner$;
RESET ROLE;
SELECT ok(true, 'Renter can read own booking-linked payment');

SELECT set_config('request.jwt.claim.sub','35100000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $outsider$
BEGIN
  IF (SELECT count(*) FROM public.payments) <> 0 THEN
    RAISE EXCEPTION 'Unrelated user can read private booking payment';
  END IF;
END;
$outsider$;
RESET ROLE;
SELECT ok(true, 'Unrelated user cannot read renter payment');

SELECT * FROM finish();
ROLLBACK;
