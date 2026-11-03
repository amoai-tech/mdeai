-- SAN-1562 · Restrict privileged event commerce to trusted server callers.
-- The public checkout and staff-scanner Edge Functions use service_role after
-- validating the payment/staff token. Clients must not call the underlying
-- finance or attendance mutations directly.
--
-- Do not gate event creation/publishing on business approvals in development.
-- This migration changes only technical security boundaries, not eligibility.

revoke execute on function public.ticket_payment_refund_v2(
  uuid, integer, text, text, uuid, text, uuid[]
) from public, anon, authenticated;
grant execute on function public.ticket_payment_refund_v2(
  uuid, integer, text, text, uuid, text, uuid[]
) to service_role;

revoke execute on function public.ticket_validate_consume(text)
  from public, anon, authenticated;
grant execute on function public.ticket_validate_consume(text)
  to service_role;

-- This RPC accepts caller-supplied event, attendee, scanner and result fields.
-- No current application caller requires direct end-user execution.
revoke execute on function public.record_check_in(
  uuid, uuid, text, uuid, text, inet, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_check_in(
  uuid, uuid, text, uuid, text, inet, text, jsonb
) to service_role;

-- Old Supabase schema defaults give visitor roles INSERT/UPDATE/DELETE and
-- even TRUNCATE on newly created public tables. Require explicit per-table
-- grants for future public access. Existing client-side grants outside Events
-- are intentionally untouched: changing them needs a separate caller audit.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- The hosted Supabase database also has supabase_admin-owned default ACLs.
-- The normal postgres migration role is not permitted to change those defaults
-- (SQLSTATE 42501). Do not issue an unauthorized ALTER DEFAULT PRIVILEGES:
-- the provider-owner grant needs a separate privileged remediation and proof.

-- Existing event-domain visitors only need their currently configured SELECT
-- grants and RLS policies. Checkout and staff-scanning persist through the
-- trusted Edge Functions; no visitor requires direct DML or TRUNCATE.
do $$
declare
  v_table record;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (c.relname = 'events' or left(c.relname, 6) = 'event_')
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table public.%I from anon',
      v_table.relname
    );
  end loop;
end
$$;
