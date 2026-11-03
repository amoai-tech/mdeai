-- SAN-1284 · Stop Unauthorized Users From Running Admin Database Actions
--
-- Repair confirmed anonymous/user-callable SECURITY DEFINER RPCs.
-- Preserve user_roles policies and authorized contest admin lookups.
-- The service caller supplies rate-limit policy and promo effects; arbitrary
-- browser-provided keys/thresholds and promo usage mutations are not trusted.
-- All changes are transactional and replay-safe.
--
-- This replaces NO checkout or approval subsystem. Development journeys stay
-- usable without business verification or publication prerequisites.

create or replace function public.has_role(
  _user_id uuid, _role public.user_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $body$
  select exists (
    select 1
      from public.user_roles r
     where r.user_id = _user_id
       and r.role = _role
       and (r.expires_at is null or r.expires_at > now())
       and (
         -- RLS policies and authenticated browser role badges may look up only
         -- the identity cryptographically bound to the authenticated request.
         _user_id = (select auth.uid())
         or
         -- Existing service-only contest administration legitimately checks
         -- a separately authorized p_actor and needs cross-user lookups.
         -- The role claim is verified by Supabase API JWT authentication.
         (select auth.jwt() ->> 'role') = 'service_role'
       )
  );
$body$;

-- PostgreSQL defaults to PUBLIC EXECUTE; direct grants may also survive.
-- Keep authenticated for user_roles RLS and is_admin() self-checks.
revoke execute on function public.has_role(uuid, public.user_role)
  from public, anon, authenticated, service_role;
grant execute on function public.has_role(uuid, public.user_role)
  to authenticated, service_role;

-- Existing Next.js and Edge rate-limit callers use service-role clients.
-- Earlier service-only grants were overwritten by a remote-schema recovery.
revoke execute on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.check_rate_limit(text, integer, integer)
  to service_role;

-- There is no tracked direct browser caller of this helper. Keep the existing
-- implementation for trusted server use; do not consume promo quota from
-- arbitrary REST calls. Checkout idempotency remains with the existing owner.
revoke execute on function public.redeem_promo_code(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.redeem_promo_code(uuid, text, uuid)
  to service_role;

comment on function public.has_role(uuid, public.user_role) is
  'Only look up the authenticated user role, or a trusted service JWT actor. Maintains user_roles RLS and service-only contest checks.';
comment on function public.check_rate_limit(text, integer, integer) is
  'Server-only durable limiter. Keys, thresholds and windows come from trusted Next.js or Edge callers.';
comment on function public.redeem_promo_code(uuid, text, uuid) is
  'Trusted-service promo usage mutation; never callable by anonymous or authenticated browsers.';
