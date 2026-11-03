-- SAN-1622: one revoked staff link is distinctly queryable from a forged QR.
-- Rollback-only local pgTAP fixture; no production writes.
begin;
set local search_path = public, extensions;
select plan(7);

select is(
  (
    select position('staff_token_revoked' in pg_get_constraintdef(c.oid)) > 0
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'event_check_ins'
      and c.conname = 'event_check_ins_result_check'
  ),
  true,
  'audit constraint explicitly allows staff_token_revoked'
);

insert into public.events (
  id, name, event_start_time, event_end_time, status, is_active
) values (
  'b1622000-0000-4000-8000-000000000033',
  'SAN-1622 revoked scanner audit fixture',
  now() + interval '1 day',
  now() + interval '2 days',
  'draft', true
);

insert into public.event_check_ins (
  event_id, qr_token, result, details
) values (
  'b1622000-0000-4000-8000-000000000033',
  'san1622-revoked-staff-qr',
  'staff_token_revoked',
  '{"reason":"staff_token_revoked","jwt_version":0,"current_version":1}'::jsonb
);

select is(
  (select count(*)::integer from public.event_check_ins
   where qr_token='san1622-revoked-staff-qr' and result='staff_token_revoked'),
  1,
  'revoked staff link has its own audit category'
);

select is(
  (select count(*)::integer from public.event_check_ins
   where qr_token='san1622-revoked-staff-qr' and result='invalid_signature'),
  0,
  'revocation does not inflate forged-signature counts'
);

insert into public.event_check_ins (
  event_id, qr_token, result, details
) values (
  'b1622000-0000-4000-8000-000000000033',
  'san1622-forged-qr',
  'invalid_signature',
  '{"reason":"INVALID_SIGNATURE"}'::jsonb
);

select is(
  (select count(*)::integer from public.event_check_ins
   where event_id='b1622000-0000-4000-8000-000000000033'
     and result='invalid_signature'),
  1,
  'forged QR remains categorized as invalid_signature'
);

select is(
  (select count(*)::integer from public.event_check_ins
   where event_id='b1622000-0000-4000-8000-000000000033'
     and result='staff_token_revoked'),
  1,
  'revoked-link summary remains independent of forgery'
);

select throws_ok(
  $$insert into public.event_check_ins(event_id, qr_token, result)
    values ('b1622000-0000-4000-8000-000000000033', 'san1622-unknown-result', 'not_a_valid_result')$$,
  '23514',
  null,
  'unexpected scan audit statuses are still rejected'
);

select is(
  (select count(*)::integer from public.event_check_ins
   where qr_token='san1622-unknown-result'),
  0,
  'rejected status cannot persist a check-in'
);

select * from finish();
rollback;
