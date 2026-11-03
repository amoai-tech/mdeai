-- SAN-1284 · Stop Unauthorized Users From Running Admin Database Actions
-- The legacy wait-list helper accepts caller-supplied user IDs and writes through
-- SECURITY DEFINER without authenticating that identity. No active MDE browser
-- or Edge Function caller of this RPC was found in the current source.
-- Retain trusted service-only compatibility; direct signed-in wait-list inserts
-- already have their own ownership-scoped table RLS policies.
-- Do not change the separate wait-list notification/expiration Cron jobs.

revoke execute on function public.fn_join_wait_list(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.fn_join_wait_list(uuid, uuid, text, text)
  to service_role;

comment on function public.fn_join_wait_list(uuid, uuid, text, text) is
  'Legacy trusted-server wait-list helper. Service-only: caller-supplied user_id must never be exposed as a browser RPC.';
