-- SAN-1105 · Broker isolation — align the showings INSERT policy to the owning-broker model
-- and make the apartment→landlord deletion boundary explicit.
--
-- Scope: exactly two changes. No other policy, grant, function or table is touched.
--
-- 1. showings insert
--    The live policy `showings_insert_authenticated` authorized through
--    `leads.user_id / leads.assigned_agent_id / is_admin()` — the *lead-owner* model — while
--    every other broker-facing path authorizes through
--    `apartments.landlord_id → acting_landlord_ids()` — the *listing-owner* model SAN-1349
--    established. Two ownership models on one table is the defect. The correct end state is no
--    direct INSERT policy at all: with RLS on and no permissive INSERT policy, a signed-in
--    INSERT is denied by default, and a future accidental table GRANT cannot open it.
--
--    SAN-1206 (2026-09-29) already revoked insert on public.showings from `authenticated` and
--    routes real creates through the service-role security definer `p1_schedule_tour_atomic`.
--    This migration removes the leftover policy and restates the revoke so source and live ACL
--    agree and the boundary is provable.
--
-- 2. apartments.landlord_id
--    `apartments_landlord_id_fkey` was on delete set null: deleting a landlord_profiles row
--    silently orphaned its apartments. SAN-1349's check blocks that only for
--    active + approved + published rows; draft/inactive rows were silently orphaned. Restrict
--    makes the dependency explicit: callers must remove or reassign the apartments first, and
--    account deletion must therefore handle listings deliberately instead of losing their owner.

begin;

-- 1 · showings insert — remove every direct INSERT path.
--
-- Stronger than replacing the policy. With RLS enabled and NO permissive INSERT
-- policy, a signed-in INSERT is denied by default even if a future migration or
-- dashboard action accidentally re-grants the table privilege. A broker never
-- authors a showing directly: the single writer is the service-role SECURITY
-- DEFINER p1_schedule_tour_atomic, which commits exactly one lead + one showing.
drop policy if exists showings_insert_authenticated on public.showings;
drop policy if exists showings_insert_broker on public.showings;

revoke insert on table public.showings from anon, authenticated;

-- 2 · Apartments must never be silently orphaned by deleting their owner.
alter table public.apartments
  drop constraint if exists apartments_landlord_id_fkey;

alter table public.apartments
  add constraint apartments_landlord_id_fkey
  foreign key (landlord_id)
  references public.landlord_profiles (id)
  on delete restrict;

comment on constraint apartments_landlord_id_fkey on public.apartments is
  'SAN-1105: restrict (was set null). Deleting a landlord profile with apartments fails loudly instead of orphaning listings; remove or reassign the apartments first.';

commit;
