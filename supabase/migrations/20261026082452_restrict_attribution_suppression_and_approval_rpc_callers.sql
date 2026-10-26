-- Narrow three existing SECURITY DEFINER RPCs to their actual callers.
-- These are technical privilege boundaries, not rental/event approval gates.
-- fn_record_conversion: internal attribution write accepts arbitrary p_user_id.
-- is_suppressed: internal email/SMS opt-out lookup exposes private identifier membership.
--   The outbox trigger calls it as postgres from a SECURITY DEFINER trigger, so
--   direct anon/authenticated EXECUTE is unnecessary.
-- decide_approval: the body enforces is_admin(), and only a signed-in admin should
--   be able to request an approval decision. Other authenticated callers still fail
--   the existing in-function authorization check.
begin;

revoke execute on function public.fn_record_conversion(uuid,text,text,integer,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_record_conversion(uuid,text,text,integer,uuid,jsonb)
  to service_role;

revoke execute on function public.is_suppressed(text,text)
  from public, anon, authenticated;
grant execute on function public.is_suppressed(text,text)
  to service_role;

revoke execute on function public.decide_approval(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.decide_approval(uuid,text,text)
  to authenticated, service_role;

commit;
