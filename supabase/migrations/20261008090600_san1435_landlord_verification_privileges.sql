-- =============================================================================
-- Migration: 20261008090600_san1435_landlord_verification_privileges.sql
-- Task:      SAN-1435 — Stop landlords from self-approving their own verification
-- =============================================================================
-- Live ACL before this migration: public.landlord_profiles was GRANT ALL to anon,
-- authenticated and service_role. RLS scopes WHICH ROW a user may write, not WHICH
-- COLUMNS. An authenticated landlord could therefore set verification_status =
-- 'approved' and verified_at = now() on their own profile, self-granting the
-- trusted state that the SAN-1431 / SAN-468 publish gate treats as a verified
-- genuine owner/agent.
--
-- Fix (Supabase column-level-security pattern): revoke table-wide write privileges
-- from anon/authenticated and re-grant only the user-editable columns. Trusted
-- fields (verification_status, verified_at), identity fields (id, user_id,
-- created_at, updated_at) and admin/statistical counters stay trusted-backend/service_role-only.
-- service_role keeps full access.
--
-- The only application writer is public.create_broker_onboarding_draft
-- (SECURITY INVOKER), which inserts (user_id, display_name, kind); the broker
-- onboarding patch then updates primary_neighborhood, notes, whatsapp_e164. Those
-- columns remain granted, so onboarding keeps working.
-- =============================================================================

revoke insert, update, delete, truncate
  on table public.landlord_profiles
  from anon, authenticated;

grant insert (
  user_id,
  display_name,
  kind,
  whatsapp_e164,
  phone_e164,
  bio,
  avatar_url,
  primary_neighborhood,
  languages,
  notes
)
on table public.landlord_profiles
to authenticated;

grant update (
  display_name,
  kind,
  whatsapp_e164,
  phone_e164,
  bio,
  avatar_url,
  primary_neighborhood,
  languages,
  notes
)
on table public.landlord_profiles
to authenticated;

comment on table public.landlord_profiles is
  'SAN-1435: end-user INSERT/UPDATE is column-limited; verification_status and verified_at are trusted fields writable only by the trusted backend/service_role.';
