-- SAN-1622 · Distinguish revoked staff links from invalid QR signatures.
-- Keep the existing event_check_ins result allowlist intact and add one
-- technical audit outcome. Existing rows and staff-link version remain valid.
-- Roll out the database constraint BEFORE deploying the ticket-validate handler.
alter table public.event_check_ins
  drop constraint event_check_ins_result_check,
  add constraint event_check_ins_result_check
    check (result in (
      'consumed',
      'already_used',
      'wrong_event',
      'event_ended',
      'invalid_signature',
      'staff_token_revoked',
      'unknown_token',
      'refunded',
      'cancelled',
      'pending_payment'
    ));
