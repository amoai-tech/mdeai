-- SAN-1304 · Increment A regression suite — recovered production-only column contracts
--
-- Proves the 21 ordinary columns, their dependent CHECKs/FKs/indexes, and the
-- production-only leads scoring trigger now exist in a fresh replay with the exact
-- production contract.
--
-- Deliberately also proves what Increment A must NOT do: it must not drag in the three
-- FTS columns (SAN-1305 owns them) and must not touch the embedding surrogate primary
-- keys (Increment B owns them).
--
-- Run with: supabase test db
begin;

select plan(98);

-- ═══════════════════════════════════════════════════════════════════════════════
-- A. The 21 columns exist (production has them; replay did not)
-- ═══════════════════════════════════════════════════════════════════════════════

select has_column('public', 'leads', 'budget_min',              'A: leads.budget_min recovered');
select has_column('public', 'leads', 'budget_max',              'A: leads.budget_max recovered');
select has_column('public', 'leads', 'conversion_probability',  'A: leads.conversion_probability recovered');
select has_column('public', 'leads', 'hot_lead_alerted',        'A: leads.hot_lead_alerted recovered');
select has_column('public', 'leads', 'last_contacted_at',       'A: leads.last_contacted_at recovered');
select has_column('public', 'leads', 'next_followup_at',        'A: leads.next_followup_at recovered');
select has_column('public', 'leads', 'pipeline_stage',          'A: leads.pipeline_stage recovered');
select has_column('public', 'leads', 'score_breakdown',         'A: leads.score_breakdown recovered');

select has_column('public', 'user_preferences', 'language',                 'A: user_preferences.language recovered');
select has_column('public', 'user_preferences', 'persona',                  'A: user_preferences.persona recovered');
select has_column('public', 'user_preferences', 'preferred_neighborhoods',  'A: user_preferences.preferred_neighborhoods recovered');
select has_column('public', 'user_preferences', 'rental_budget_min',        'A: user_preferences.rental_budget_min recovered');
select has_column('public', 'user_preferences', 'rental_budget_max',        'A: user_preferences.rental_budget_max recovered');
select has_column('public', 'user_preferences', 'rental_bedrooms',          'A: user_preferences.rental_bedrooms recovered');
select has_column('public', 'user_preferences', 'whatsapp_opted_in',        'A: user_preferences.whatsapp_opted_in recovered');
select has_column('public', 'user_preferences', 'whatsapp_phone',           'A: user_preferences.whatsapp_phone recovered');

select has_column('public', 'event_orders', 'buyer_anon_id',    'A: event_orders.buyer_anon_id recovered');
select has_column('public', 'event_orders', 'discount_cents',   'A: event_orders.discount_cents recovered');
select has_column('public', 'event_orders', 'promo_code_id',    'A: event_orders.promo_code_id recovered');

select has_column('public', 'event_tickets', 'is_hidden',       'A: event_tickets.is_hidden recovered');
select has_column('public', 'apartments',    'source',          'A: apartments.source recovered');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B. Exact types (from live production, not reconstructed from names)
-- ═══════════════════════════════════════════════════════════════════════════════

select col_type_is('public', 'leads', 'budget_min',             'numeric',                   'B: leads.budget_min is numeric');
select col_type_is('public', 'leads', 'budget_max',             'numeric',                   'B: leads.budget_max is numeric');
select col_type_is('public', 'leads', 'conversion_probability', 'double precision',          'B: leads.conversion_probability is double precision');
select col_type_is('public', 'leads', 'hot_lead_alerted',       'boolean',                   'B: leads.hot_lead_alerted is boolean');
select col_type_is('public', 'leads', 'last_contacted_at',      'timestamp with time zone',  'B: leads.last_contacted_at is timestamptz');
select col_type_is('public', 'leads', 'next_followup_at',       'timestamp with time zone',  'B: leads.next_followup_at is timestamptz');
select col_type_is('public', 'leads', 'pipeline_stage',         'text',                      'B: leads.pipeline_stage is text');
select col_type_is('public', 'leads', 'score_breakdown',        'jsonb',                     'B: leads.score_breakdown is jsonb');

select col_type_is('public', 'user_preferences', 'language',                'text',      'B: user_preferences.language is text');
select col_type_is('public', 'user_preferences', 'persona',                 'text',      'B: user_preferences.persona is text');
select col_type_is('public', 'user_preferences', 'preferred_neighborhoods', 'text[]',    'B: user_preferences.preferred_neighborhoods is text[]');
select col_type_is('public', 'user_preferences', 'rental_budget_min',       'numeric',   'B: user_preferences.rental_budget_min is numeric');
select col_type_is('public', 'user_preferences', 'rental_budget_max',       'numeric',   'B: user_preferences.rental_budget_max is numeric');
select col_type_is('public', 'user_preferences', 'rental_bedrooms',         'integer',   'B: user_preferences.rental_bedrooms is integer');
select col_type_is('public', 'user_preferences', 'whatsapp_opted_in',       'boolean',   'B: user_preferences.whatsapp_opted_in is boolean');
select col_type_is('public', 'user_preferences', 'whatsapp_phone',          'text',      'B: user_preferences.whatsapp_phone is text');

select col_type_is('public', 'event_orders', 'buyer_anon_id',   'text',      'B: event_orders.buyer_anon_id is text');
select col_type_is('public', 'event_orders', 'discount_cents',  'integer',   'B: event_orders.discount_cents is integer');
select col_type_is('public', 'event_orders', 'promo_code_id',   'uuid',      'B: event_orders.promo_code_id is uuid');

select col_type_is('public', 'event_tickets', 'is_hidden',      'boolean',   'B: event_tickets.is_hidden is boolean');
select col_type_is('public', 'apartments',    'source',         'text',      'B: apartments.source is text');

-- ═══════════════════════════════════════════════════════════════════════════════
-- C. Nullability — only these two are NOT NULL in production
-- ═══════════════════════════════════════════════════════════════════════════════

select col_not_null('public', 'event_orders',  'discount_cents', 'C: event_orders.discount_cents is NOT NULL');
select col_not_null('public', 'event_tickets', 'is_hidden',      'C: event_tickets.is_hidden is NOT NULL');
select col_is_null('public',  'event_orders',  'promo_code_id',  'C: event_orders.promo_code_id is NULL-able');
select col_is_null('public',  'leads',         'pipeline_stage', 'C: leads.pipeline_stage is NULL-able');

-- ═══════════════════════════════════════════════════════════════════════════════
-- D. Defaults — the 10 columns that carry one in production
-- ═══════════════════════════════════════════════════════════════════════════════

-- NOTE ON METHOD: pgTAP's col_default_is picks its `anyelement` overload here and
-- compares the default VALUE cast to the column type, not the expression text — and
-- for jsonb that makes it try to parse the expression string as JSON. Asserting
-- pg_get_expr() directly is unambiguous and is a stricter match against the live
-- production definition, which is exactly what this task requires.

select col_has_default('public', 'leads', 'hot_lead_alerted', 'D: leads.hot_lead_alerted has a default');
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.leads'::regclass and a.attname = 'hot_lead_alerted'),
          'false', 'D: leads.hot_lead_alerted defaults false exactly');

select col_has_default('public', 'leads', 'pipeline_stage', 'D: leads.pipeline_stage has a default');
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.leads'::regclass and a.attname = 'pipeline_stage'),
          '''new''::text', 'D: leads.pipeline_stage defaults ''new'' exactly');

select col_has_default('public', 'leads', 'score_breakdown', 'D: leads.score_breakdown has a default');
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.leads'::regclass and a.attname = 'score_breakdown'),
          '''{}''::jsonb', 'D: leads.score_breakdown defaults {} exactly');

select col_has_default('public', 'user_preferences', 'language', 'D: user_preferences.language has a default');
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.user_preferences'::regclass and a.attname = 'language'),
          '''es''::text', 'D: user_preferences.language defaults ''es'' exactly');

select col_has_default('public', 'user_preferences', 'persona', 'D: user_preferences.persona has a default');
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.user_preferences'::regclass and a.attname = 'persona'),
          '''general''::text', 'D: user_preferences.persona defaults ''general'' exactly');

select col_has_default('public', 'user_preferences', 'preferred_neighborhoods', 'D: user_preferences.preferred_neighborhoods has a default');
select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.user_preferences'::regclass and a.attname = 'preferred_neighborhoods'),
          '''{}''::text[]', 'D: user_preferences.preferred_neighborhoods defaults {} exactly');

select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.user_preferences'::regclass and a.attname = 'whatsapp_opted_in'),
          'false', 'D: user_preferences.whatsapp_opted_in defaults false exactly');

select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.event_orders'::regclass and a.attname = 'discount_cents'),
          '0', 'D: event_orders.discount_cents defaults 0 exactly');

select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.event_tickets'::regclass and a.attname = 'is_hidden'),
          'false', 'D: event_tickets.is_hidden defaults false exactly');

select is((select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
            where d.adrelid = 'public.apartments'::regclass and a.attname = 'source'),
          '''manual''::text', 'D: apartments.source defaults ''manual'' exactly');

-- ═══════════════════════════════════════════════════════════════════════════════
-- E. Dependent CHECKs + the promo FK — asserted by exact production definition
-- (existence is implied: these compare pg_get_constraintdef to production verbatim)
-- ═══════════════════════════════════════════════════════════════════════════════

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.leads'::regclass and conname = 'leads_pipeline_stage_check'),
  $$CHECK ((pipeline_stage = ANY (ARRAY['new'::text, 'contacted'::text, 'showing_scheduled'::text, 'applied'::text, 'closed_won'::text, 'closed_lost'::text])))$$,
  'E: leads_pipeline_stage_check matches production exactly');

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.user_preferences'::regclass and conname = 'user_preferences_persona_check'),
  $$CHECK ((persona = ANY (ARRAY['renter'::text, 'tourist'::text, 'investor'::text, 'host'::text, 'general'::text])))$$,
  'E: user_preferences_persona_check matches production exactly');

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.event_orders'::regclass and conname = 'event_orders_discount_cents_check'),
  'CHECK ((discount_cents >= 0))',
  'E: event_orders_discount_cents_check matches production exactly');

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.apartments'::regclass and conname = 'apartments_source_check'),
  $$CHECK ((source = ANY (ARRAY['manual'::text, 'seed'::text, 'firecrawl'::text, 'api'::text])))$$,
  'E: apartments_source_check matches production exactly');

select col_is_fk('public', 'event_orders', 'promo_code_id', 'E: event_orders.promo_code_id is a foreign key');
select is(
  (select confrelid::regclass::text from pg_constraint
    where conrelid = 'public.event_orders'::regclass and conname = 'event_orders_promo_code_id_fkey'),
  'event_promo_codes',
  'E: event_orders_promo_code_id_fkey references event_promo_codes');

-- ═══════════════════════════════════════════════════════════════════════════════
-- F. Dependent indexes (ordinary btree/gin only — apartments_fts_idx is SAN-1305)
-- ═══════════════════════════════════════════════════════════════════════════════

select has_index('public', 'leads', 'idx_leads_followup', 'F: idx_leads_followup exists');
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_leads_followup'),
  $$CREATE INDEX idx_leads_followup ON public.leads USING btree (next_followup_at) WHERE (pipeline_stage <> ALL (ARRAY['closed_won'::text, 'closed_lost'::text]))$$,
  'F: idx_leads_followup matches production exactly');

select has_index('public', 'leads', 'idx_leads_pipeline', 'F: idx_leads_pipeline exists');
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_leads_pipeline'),
  'CREATE INDEX idx_leads_pipeline ON public.leads USING btree (pipeline_stage, score DESC NULLS LAST)',
  'F: idx_leads_pipeline matches production exactly');

-- Partial indexes and non-btree access methods are exactly where PostgreSQL
-- normalisation could silently diverge from production, so every index here is
-- asserted by its full definition rather than by name alone.
select has_index('public', 'leads', 'idx_leads_hot', 'F: idx_leads_hot exists');
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_leads_hot'),
  $$CREATE INDEX idx_leads_hot ON public.leads USING btree (created_at DESC) WHERE ((score >= (80)::numeric) AND (hot_lead_alerted = false))$$,
  'F: idx_leads_hot matches production exactly (partial predicate as normalised)');

select has_index('public', 'user_preferences', 'idx_user_preferences_neighborhoods', 'F: idx_user_preferences_neighborhoods exists');
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_user_preferences_neighborhoods'),
  'CREATE INDEX idx_user_preferences_neighborhoods ON public.user_preferences USING gin (preferred_neighborhoods)',
  'F: idx_user_preferences_neighborhoods matches production exactly (gin access method)');

select has_index('public', 'event_orders', 'event_orders_buyer_anon_idx', 'F: event_orders_buyer_anon_idx exists');
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'event_orders_buyer_anon_idx'),
  'CREATE INDEX event_orders_buyer_anon_idx ON public.event_orders USING btree (buyer_anon_id) WHERE (buyer_anon_id IS NOT NULL)',
  'F: event_orders_buyer_anon_idx matches production exactly (partial predicate)');

select has_index('public', 'event_orders', 'idx_event_orders_promo_code_id', 'F: idx_event_orders_promo_code_id exists');
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_event_orders_promo_code_id'),
  'CREATE INDEX idx_event_orders_promo_code_id ON public.event_orders USING btree (promo_code_id)',
  'F: idx_event_orders_promo_code_id matches production exactly');

-- ═══════════════════════════════════════════════════════════════════════════════
-- G. The production-only scoring trigger
-- ═══════════════════════════════════════════════════════════════════════════════

select has_trigger('public', 'leads', 'trg_compute_lead_score', 'G: trg_compute_lead_score exists');
select trigger_is('public', 'leads', 'trg_compute_lead_score', 'public', 'compute_lead_score',
                  'G: trg_compute_lead_score calls public.compute_lead_score()');
-- trigger_is above checks the function only; the UPDATE OF column list and the BEFORE
-- timing are part of the recovered contract too, so assert the definition verbatim.
select is(
  (select pg_get_triggerdef(oid) from pg_trigger
    where tgrelid = 'public.leads'::regclass and tgname = 'trg_compute_lead_score'),
  'CREATE TRIGGER trg_compute_lead_score BEFORE INSERT OR UPDATE OF email, phone, budget_min, budget_max, metadata ON public.leads FOR EACH ROW EXECUTE FUNCTION compute_lead_score()',
  'G: trg_compute_lead_score matches the production definition exactly');

-- ═══════════════════════════════════════════════════════════════════════════════
-- H. Scope guards — Increment A must not overreach
-- ═══════════════════════════════════════════════════════════════════════════════

select hasnt_column('public', 'apartments', 'fts_content', 'H: apartments.fts_content NOT added (SAN-1305 owns it)');

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'fts_content'),
  0, 'H: events.fts_content NOT added (SAN-1305 owns it)');

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'restaurants' and column_name = 'fts_content'),
  0, 'H: restaurants.fts_content NOT added (SAN-1305 owns it)');

-- Increment B owns the embedding surrogate PK conversion; A must not touch it.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (('event_embeddings','id'), ('listing_embeddings','id'), ('restaurant_embeddings','id'))),
  0, 'H: embedding surrogate id columns NOT added (Increment B owns them)');

-- ═══════════════════════════════════════════════════════════════════════════════
-- I. Behavioural proof — the recovered scoring trigger actually fires and recomputes
--
-- Sections A–H prove the trigger EXISTS with the right definition. They do not prove
-- it does anything. That distinction is the whole point here: before Increment A a
-- fresh replay had compute_lead_score() and NO trigger at all, so lead scoring
-- silently never ran. Asserting the behaviour, not just the object, is what makes
-- this recovery meaningful.
--
-- Weights read from the function body: email 30, phone 40, budget 20
-- (budget_min OR budget_max), metadata.move_in_date 20,
-- metadata.ready_to_apply == 'true' 50. Maximum 160.
-- ═══════════════════════════════════════════════════════════════════════════════

-- I1. Maximal signal set -> 160
insert into public.leads (email, phone, budget_min, budget_max, metadata)
values ('san1304a-max@example.test', '+573000000001', 1000000, 2000000,
        '{"move_in_date":"2026-10-01","ready_to_apply":"true"}'::jsonb);

select is((select score from public.leads where email = 'san1304a-max@example.test'),
          160.00, 'I: full signal set scores 160');
select is((select score_breakdown from public.leads where email = 'san1304a-max@example.test'),
          '{"email":30,"phone":40,"budget":20,"move_in_date":20,"ready_to_apply":50}'::jsonb,
          'I: full signal set records every component');

-- I2. Email alone -> 30
insert into public.leads (email) values ('san1304a-min@example.test');
select is((select score from public.leads where email = 'san1304a-min@example.test'),
          30.00, 'I: email alone scores 30');
select is((select score_breakdown from public.leads where email = 'san1304a-min@example.test'),
          '{"email":30}'::jsonb, 'I: email alone records only the email component');

-- I3. budget_min alone satisfies the OR even with budget_max NULL -> 30 + 20
insert into public.leads (email, budget_min) values ('san1304a-budget@example.test', 500000);
select is((select score from public.leads where email = 'san1304a-budget@example.test'),
          50.00, 'I: budget_min alone earns the budget component (OR semantics)');

-- I4. metadata.move_in_date alone -> 30 + 20
insert into public.leads (email, metadata)
values ('san1304a-movein@example.test', '{"move_in_date":"2026-11-01"}'::jsonb);
select is((select score from public.leads where email = 'san1304a-movein@example.test'),
          50.00, 'I: metadata.move_in_date scores 20');

-- I5. UPDATE recomputes from scratch — no accumulation, no staleness
update public.leads set phone = '+573000000002' where email = 'san1304a-min@example.test';
select is((select score from public.leads where email = 'san1304a-min@example.test'),
          70.00, 'I: UPDATE adding phone recomputes 30 -> 70');

update public.leads set metadata = '{"ready_to_apply":"true"}'::jsonb
  where email = 'san1304a-min@example.test';
select is((select score from public.leads where email = 'san1304a-min@example.test'),
          120.00, 'I: UPDATE adding ready_to_apply recomputes 70 -> 120');
select is((select score_breakdown from public.leads where email = 'san1304a-min@example.test'),
          '{"email":30,"phone":40,"ready_to_apply":50}'::jsonb,
          'I: recomputed breakdown replaces the old one entirely');

-- I6. Clearing a signal subtracts it -> 120 - 40
update public.leads set phone = null where email = 'san1304a-min@example.test';
select is((select score from public.leads where email = 'san1304a-min@example.test'),
          80.00, 'I: UPDATE clearing phone recomputes 120 -> 80 (no carry-over)');

-- I7. Column scoping is part of the contract: the trigger fires only for
--     email/phone/budget_min/budget_max/metadata. Writing a sentinel score and then
--     changing an unrelated column proves it did not fire.
update public.leads set score = 999 where email = 'san1304a-min@example.test';
update public.leads set status = 'contacted' where email = 'san1304a-min@example.test';
select is((select score from public.leads where email = 'san1304a-min@example.test'),
          999.00, 'I: unrelated-column UPDATE does not recompute (trigger stays column-scoped)');

select * from finish();
rollback;
