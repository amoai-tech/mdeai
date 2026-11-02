BEGIN;
SELECT plan(18);

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
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.bookings'::regclass
      AND attname = 'user_id' AND attnotnull
  ),
  'A NULL user cannot bypass the apartment idempotency index'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.bookings'::regclass
      AND tgname = 'booking_guard_apartment_payment_authority'
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
      AND qual ILIKE '%b.user_id%'
      AND qual ILIKE '%auth.uid%'
      AND qual ILIKE '%apartment%'
  ),
  'Dedicated renter payment policy checks ownership and apartment type'
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


-- The policy must actually run, rather than existing on a table with RLS off.
SELECT ok(
  (SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE oid IN ('public.bookings'::regclass, 'public.payments'::regclass)),
  'RLS enabled for both booking and payment tables'
);

SELECT ok(
  has_function_privilege('service_role',
    'public.guard_apartment_booking_payment_authority()'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.guard_apartment_booking_payment_authority()'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('authenticated',
    'public.guard_apartment_booking_payment_authority()'::regprocedure, 'EXECUTE'),
  'Trusted service_role retains trigger EXECUTE; browser roles do not'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.payments', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.payments', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.payments', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.payments', 'UPDATE')
  AND has_table_privilege('authenticated', 'public.payments', 'SELECT'),
  'Payment grants are read-only to authenticated and denied to anon'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.payments', 'DELETE')
  AND EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payments'
    AND policyname='payments_delete_admin'),
  'Existing authenticated Super Admin DELETE path stays available under RLS'
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

  -- Keep status and payment-state probes independent: one cannot mask another.
  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date,
      status, payment_status, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, 'confirmed', 'pending', 'san351-forged-status'
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Confirmed status without payment was accepted'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date,
      payment_status, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, NULL, 'san351-null-payment'
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'NULL payment status was accepted'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date,
      confirmation_code, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, 'FAKE-RECEIPT', 'san351-fake-code'
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Supplied confirmation code persisted'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date,
      partner_id, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, '35100000-0000-4000-8000-000000000005',
      'san351-forged-partner'
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could assign a partner'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date,
      partner_status, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, 'approved', 'san351-forged-approval'
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could forge partner approval'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.bookings (
      user_id, booking_type, resource_id, resource_title, start_date,
      currency, idempotency_key
    ) VALUES (
      '35100000-0000-4000-8000-000000000001', 'apartment',
      '35100000-0000-4000-8000-000000000002', 'Development apartment',
      CURRENT_DATE + 1, 'COP', 'san351-fake-currency'
    );
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could set unverified currency'; END IF;

  -- Defaults are normalized; the existing generator still issues a real code.
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = v_booking AND status = 'pending'
      AND payment_status = 'pending' AND currency IS NULL
      AND confirmation_code IS NOT NULL AND partner_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Pending apartment defaults or generated code are wrong';
  END IF;

  v_denied := false;
  BEGIN
    UPDATE public.bookings
    SET id = '35100000-0000-4000-8000-000000000006'
    WHERE id = v_booking;
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could alter booking primary key'; END IF;

  v_denied := false;
  BEGIN
    UPDATE public.bookings SET confirmation_code = 'FAKE-UPDATED'
    WHERE id = v_booking;
  EXCEPTION WHEN check_violation THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could alter confirmation code'; END IF;

  v_denied := false;
  BEGIN
    INSERT INTO public.payments (booking_id, amount, currency, status)
    VALUES (v_booking, 1, 'COP', 'succeeded');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Renter could forge a successful payment'; END IF;

  -- A renter can still edit a non-financial note and cancel an unpaid intent.
  UPDATE public.bookings SET special_requests = 'Window preferred'
  WHERE id = v_booking;
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = v_booking
                 AND special_requests = 'Window preferred') THEN
    RAISE EXCEPTION 'Safe owner update did not persist';
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled', cancelled_at = '2000-01-01'::timestamptz
  WHERE id = v_booking;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings WHERE id = v_booking
      AND status = 'cancelled'
      AND cancelled_at >= statement_timestamp() - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'Renter cancellation or authoritative timestamp failed';
  END IF;
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

-- Create a second real renter, booking and payment; their own row must be
-- visible, while the first renter's existing payment must remain invisible.
INSERT INTO public.profiles (id, email)
VALUES ('35100000-0000-4000-8000-000000000003', 'san351-outsider@example.invalid');

INSERT INTO public.bookings (
  user_id, booking_type, resource_id, resource_title, start_date, status, idempotency_key
) VALUES (
  '35100000-0000-4000-8000-000000000003', 'apartment',
  '35100000-0000-4000-8000-000000000004', 'Other development apartment',
  CURRENT_DATE + 2, 'pending', 'san351-qa-other'
);

INSERT INTO public.payments (booking_id, amount, currency, status)
SELECT id, 700000, 'COP', 'pending' FROM public.bookings
WHERE idempotency_key = 'san351-qa-other';

SELECT set_config('app.test_a_booking', (SELECT id::text FROM public.bookings
  WHERE idempotency_key='san351-qa-repeat'), true);
SELECT set_config('app.test_b_booking', (SELECT id::text FROM public.bookings
  WHERE idempotency_key='san351-qa-other'), true);

-- A prior replay creates a broad owner SELECT policy, but production does not
-- have it. Drop it only inside this rolled-back test transaction to prove
-- the new dedicated apartment SELECT predicate cannot be masked by it.
DROP POLICY IF EXISTS payments_select_authenticated ON public.payments;

SET LOCAL ROLE authenticated;
DO $owner$
DECLARE
  v_denied boolean := false;
BEGIN
  IF (SELECT count(*) FROM public.payments
      WHERE booking_id IN (SELECT id FROM public.bookings
                           WHERE idempotency_key='san351-qa-repeat')) <> 1 THEN
    RAISE EXCEPTION 'Renter cannot read own booking-linked payment';
  END IF;

  BEGIN
    UPDATE public.payments SET status = 'succeeded'
    WHERE booking_id = current_setting('app.test_a_booking')::uuid;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Renter could mark existing payment succeeded';
  END IF;
END;
$owner$;
RESET ROLE;
SELECT ok(true, 'Renter can read own booking-linked payment');

SELECT set_config('request.jwt.claim.sub','35100000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $outsider$
BEGIN
  IF (SELECT count(*) FROM public.payments
      WHERE booking_id = current_setting('app.test_a_booking')::uuid) <> 0 THEN
    RAISE EXCEPTION 'Unrelated user can read private booking payment';
  END IF;
END;
$outsider$;
RESET ROLE;
SELECT ok(true, 'Unrelated user cannot read renter payment');

-- Unlike an empty-table test, BOTH renters have actual persisted payments.
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.payments
   WHERE booking_id = current_setting('app.test_b_booking')::uuid), 1,
  'Renter B reads their own existing payment row'
);
SELECT is(
  (SELECT count(*)::int FROM public.payments
   WHERE booking_id = current_setting('app.test_a_booking')::uuid), 0,
  'Renter B cannot read Renter A payment row'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','35100000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.payments
   WHERE booking_id = current_setting('app.test_b_booking')::uuid), 0,
  'Renter A cannot read Renter B payment row'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
