-- SAN-1304 · Increment A — recover the 21 ordinary production-only column contracts
--
-- WHY
-- Production has columns on shared `public` tables that a database rebuilt from
-- supabase/migrations/** does not. PR #58 found the first gaps by comparing table
-- existence; comparing *column sets* exposed the rest. This migration closes the
-- ordinary (non-FTS, non-embedding-PK) part of that gap.
--
-- Verified gap, measured 2026-09-18 against live production (project zkwcbyzk…),
-- by diffing information_schema.columns for all 104 shared tables:
--   production-only tables : 32   (SB-002 / SAN-1283 territory, not this migration)
--   differing shared tables: 11
--   of which Increment A   : 5 tables, 21 columns
--
-- THE 21 COLUMNS — exact production contract, extracted from the live catalog
-- (pg_attribute + pg_attrdef), never reconstructed from column names:
--
--   leads.budget_min              numeric                    NULL
--   leads.budget_max              numeric                    NULL
--   leads.conversion_probability  double precision           NULL
--   leads.hot_lead_alerted        boolean                    NULL  DEFAULT false
--   leads.last_contacted_at       timestamptz                NULL
--   leads.next_followup_at        timestamptz                NULL
--   leads.pipeline_stage          text                       NULL  DEFAULT 'new'
--   leads.score_breakdown         jsonb                      NULL  DEFAULT '{}'
--   user_preferences.language                 text          NULL  DEFAULT 'es'
--   user_preferences.persona                  text          NULL  DEFAULT 'general'
--   user_preferences.preferred_neighborhoods  text[]        NULL  DEFAULT '{}'
--   user_preferences.rental_budget_min        numeric       NULL
--   user_preferences.rental_budget_max        numeric       NULL
--   user_preferences.rental_bedrooms          integer       NULL
--   user_preferences.whatsapp_opted_in        boolean       NULL  DEFAULT false
--   user_preferences.whatsapp_phone           text          NULL
--   event_orders.buyer_anon_id    text                       NULL
--   event_orders.discount_cents   integer                    NOT NULL DEFAULT 0
--   event_orders.promo_code_id    uuid                       NULL
--   event_tickets.is_hidden       boolean                    NOT NULL DEFAULT false
--   apartments.source             text                       NULL  DEFAULT 'manual'
--
-- DEPENDENT OBJECTS recovered with them (they cannot exist without the columns):
--   constraints : leads_pipeline_stage_check, user_preferences_persona_check,
--                 event_orders_discount_cents_check, apartments_source_check,
--                 event_orders_promo_code_id_fkey -> event_promo_codes(id)
--   indexes     : idx_leads_followup, idx_leads_pipeline, idx_leads_hot,
--                 idx_user_preferences_neighborhoods (gin),
--                 event_orders_buyer_anon_idx, idx_event_orders_promo_code_id
--   trigger     : leads.trg_compute_lead_score -> public.compute_lead_score()
--
-- The trigger is a genuine production-only object: migration
-- 20260530012233_data010_search_path_hardening.sql CREATES compute_lead_score()
-- but NO migration anywhere creates the trigger that fires it. Production has it,
-- a fresh replay did not. The function reads budget_min/budget_max/metadata and
-- writes score/score_breakdown, so it could not be attached until now.
--
-- IDEMPOTENT ON PURPOSE — this migration runs against production, where every one
-- of these objects ALREADY EXISTS. `add column if not exists` is a no-op there, but
-- `add constraint` / `create trigger` have no IF NOT EXISTS and would hard-fail.
-- Every non-column statement is therefore guarded by an existence check. The intent
-- is schema-state preserving on production and gap-closing on a fresh replay.
--
-- DELIBERATELY NOT INCLUDED
--   * apartments.fts_content, events.fts_content, restaurants.fts_content
--     -> SAN-1305 (SB-002C). These are not ordinary columns; restoring them
--        reactivates hybrid search.
--   * event_embeddings.id / listing_embeddings.id / restaurant_embeddings.id
--     -> SAN-1304 Increment B. Those are primary-key CONVERSIONS, not additions,
--        and carry materially different lock/rollback risk.
--   * Independent production-only drift that these columns do NOT depend on, found
--     during this recon and reported for separate ownership rather than smuggled in:
--        - apartments_moderation_status_check, apartments_moderation_idx,
--          idx_apartments_created_by
--        - event_orders_sponsor_attribution (needs sponsor.attribute_order())
--        - ai_runs.user_id nullability differs (prod NULL-able, replay NOT NULL)
--        - embedding content_hash / updated_at nullability and the `model` default
--          (prod 'embedding-004', replay 'gemini-embedding-001')

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Columns
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.leads
  add column if not exists budget_min             numeric,
  add column if not exists budget_max             numeric,
  add column if not exists conversion_probability double precision,
  add column if not exists hot_lead_alerted       boolean default false,
  add column if not exists last_contacted_at      timestamp with time zone,
  add column if not exists next_followup_at       timestamp with time zone,
  add column if not exists pipeline_stage         text default 'new',
  add column if not exists score_breakdown        jsonb default '{}'::jsonb;

alter table public.user_preferences
  add column if not exists language                text default 'es',
  add column if not exists persona                 text default 'general',
  add column if not exists preferred_neighborhoods text[] default '{}'::text[],
  add column if not exists rental_budget_min       numeric,
  add column if not exists rental_budget_max       numeric,
  add column if not exists rental_bedrooms         integer,
  add column if not exists whatsapp_opted_in       boolean default false,
  add column if not exists whatsapp_phone          text;

alter table public.event_orders
  add column if not exists buyer_anon_id  text,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists promo_code_id  uuid;

alter table public.event_tickets
  add column if not exists is_hidden boolean not null default false;

alter table public.apartments
  add column if not exists source text default 'manual';

comment on column public.apartments.source is
  'V1: where the listing came from (manual/seed/firecrawl/api). Distinct from source_url and source_listing_id which describe an upstream listing.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. CHECK constraints (guarded — these already exist in production)
-- ═══════════════════════════════════════════════════════════════════════════════

do $do$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.leads'::regclass
                    and conname  = 'leads_pipeline_stage_check') then
    alter table public.leads add constraint leads_pipeline_stage_check
      check (pipeline_stage = any (array['new'::text, 'contacted'::text,
                                         'showing_scheduled'::text, 'applied'::text,
                                         'closed_won'::text, 'closed_lost'::text]));
  end if;
end
$do$;

do $do$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.user_preferences'::regclass
                    and conname  = 'user_preferences_persona_check') then
    alter table public.user_preferences add constraint user_preferences_persona_check
      check (persona = any (array['renter'::text, 'tourist'::text, 'investor'::text,
                                   'host'::text, 'general'::text]));
  end if;
end
$do$;

do $do$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.event_orders'::regclass
                    and conname  = 'event_orders_discount_cents_check') then
    alter table public.event_orders add constraint event_orders_discount_cents_check
      check (discount_cents >= 0);
  end if;
end
$do$;

do $do$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.apartments'::regclass
                    and conname  = 'apartments_source_check') then
    alter table public.apartments add constraint apartments_source_check
      check (source = any (array['manual'::text, 'seed'::text,
                                  'firecrawl'::text, 'api'::text]));
  end if;
end
$do$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. The promo-code FK that could not be restored in PR #58 (the column was missing)
-- ═══════════════════════════════════════════════════════════════════════════════

do $do$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.event_orders'::regclass
                    and conname  = 'event_orders_promo_code_id_fkey') then
    alter table public.event_orders add constraint event_orders_promo_code_id_fkey
      foreign key (promo_code_id) references public.event_promo_codes(id);
  end if;
end
$do$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Dependent indexes
-- ═══════════════════════════════════════════════════════════════════════════════

create index if not exists idx_leads_followup
  on public.leads using btree (next_followup_at)
  where pipeline_stage <> all (array['closed_won'::text, 'closed_lost'::text]);

create index if not exists idx_leads_pipeline
  on public.leads using btree (pipeline_stage, score desc nulls last);

create index if not exists idx_leads_hot
  on public.leads using btree (created_at desc)
  where score >= 80 and hot_lead_alerted = false;

create index if not exists idx_user_preferences_neighborhoods
  on public.user_preferences using gin (preferred_neighborhoods);

create index if not exists event_orders_buyer_anon_idx
  on public.event_orders using btree (buyer_anon_id)
  where buyer_anon_id is not null;

create index if not exists idx_event_orders_promo_code_id
  on public.event_orders using btree (promo_code_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. The scoring trigger — created by NO migration anywhere; production-only
-- ═══════════════════════════════════════════════════════════════════════════════

do $do$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.leads'::regclass
                    and tgname  = 'trg_compute_lead_score') then
    create trigger trg_compute_lead_score
      before insert or update of email, phone, budget_min, budget_max, metadata
      on public.leads
      for each row execute function public.compute_lead_score();
  end if;
end
$do$;
