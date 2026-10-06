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
--    established. Two ownership models on one table is the defect. This migration replaces the
--    policy with the owning-broker rule and drops the is_admin() widening.
--
--    Defence in depth, not the primary control: SAN-1206 (2026-09-29) already revoked insert on
--    public.showings from `authenticated` and routes real creates through the service-role
--    security definer `p1_schedule_tour_atomic`. The policy is corrected so that if insert is
--    ever re-granted it grants only the owning broker — never a lead-owner or an admin.
--
-- 2. apartments.landlord_id
--    `apartments_landlord_id_fkey` was on delete set null: deleting a landlord_profiles row
--    silently orphaned its apartments. SAN-1349's check blocks that only for
--    active + approved + published rows; draft/inactive rows were silently orphaned. Restrict
--    makes the dependency explicit: callers must remove or reassign the apartments first, and
--    account deletion must therefore handle listings deliberately instead of losing their owner.

begin;

-- 1 · showings insert — owning broker only.
drop policy if exists showings_insert_authenticated on public.showings;
drop policy if exists showings_insert_broker on public.showings;

create policy showings_insert_broker
  on public.showings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.apartments a
      where a.id = showings.apartment_id
        and a.landlord_id in (select public.acting_landlord_ids())
    )
  );

comment on policy showings_insert_broker on public.showings is
  'SAN-1105: a signed-in broker may create a showing only for an apartment it owns through the canonical landlord_id → acting_landlord_ids() chain. No lead-owner and no is_admin() path.';

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
