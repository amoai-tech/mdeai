-- SAN-1391 · partner_drafts race guard — the assumption drafts.ts depends on.
--
-- `upsertDraft` treats a 23505 from the insert as "another session created the
-- active draft first" and converts it into a DraftConflictError. That recovery
-- only works if the partial unique index on (profile_id, type) WHERE submitted_at
-- IS NULL actually exists and actually enforces uniqueness. This file proves the
-- assumption instead of trusting it.
--
-- The index is created by supabase/migrations/20260606130500_ptr006_partner_drafts.sql.
-- If a future migration drops or narrows it, this test fails.
--
-- Run with: supabase test db

begin;

select plan(4);

-- A profile is the only fixture needed: partner_drafts.profile_id is FK → profiles(id)
-- and profiles has no FK to auth.users in this schema.
insert into public.profiles (id, email, full_name)
values ('e1391000-0000-4000-8000-000000000001', 'san1391-owner@example.com', 'SAN1391 Owner');

-- ═══════════════════════════════════════════════════════════════════════════════
-- A · CONTRACT — the index exists, is unique, and is partial on submitted_at.
-- ═══════════════════════════════════════════════════════════════════════════════

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'partner_drafts'
      and indexname = 'idx_partner_drafts_active_unique'
      and indexdef ilike '%unique%'
      and indexdef ilike '%submitted_at is null%'
  ),
  'A1: the active-draft partial unique index exists (unique, submitted_at IS NULL)');

insert into public.partner_drafts (id, profile_id, type, step, payload)
values (
  'f1391000-0000-4000-8000-000000000001',
  'e1391000-0000-4000-8000-000000000001',
  'landlord', 1, '{"payloadVersion":1,"stepId":"identity","data":{}}'::jsonb
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- B · RACE GUARD — a second active draft of the SAME type is rejected with 23505,
--     which is the exact signal upsertDraft keys on.
-- ═══════════════════════════════════════════════════════════════════════════════

select throws_ok($q$
  insert into public.partner_drafts (id, profile_id, type, step, payload)
  values (
    'f1391000-0000-4000-8000-000000000002',
    'e1391000-0000-4000-8000-000000000001',
    'landlord', 1, '{"payloadVersion":1,"stepId":"intent","data":{}}'::jsonb
  )
$q$, '23505', NULL,
  'B1: a second active draft for the same (profile_id, type) raises 23505');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C · CONTROLS — the partial index is per type and only covers unsubmitted rows.
-- ═══════════════════════════════════════════════════════════════════════════════

select lives_ok($q$
  insert into public.partner_drafts (id, profile_id, type, step, payload)
  values (
    'f1391000-0000-4000-8000-000000000003',
    'e1391000-0000-4000-8000-000000000001',
    'broker', 1, '{"payloadVersion":1,"stepId":"identity","data":{}}'::jsonb
  )
$q$, 'C1: a different onboarding type is a separate active draft');

update public.partner_drafts
  set submitted_at = now()
  where id = 'f1391000-0000-4000-8000-000000000001';

select lives_ok($q$
  insert into public.partner_drafts (id, profile_id, type, step, payload)
  values (
    'f1391000-0000-4000-8000-000000000004',
    'e1391000-0000-4000-8000-000000000001',
    'landlord', 1, '{"payloadVersion":1,"stepId":"identity","data":{}}'::jsonb
  )
$q$, 'C2: a submitted draft frees the slot for a new active draft');

select * from finish();
rollback;
