-- SAN-1482 · Recover the live private vote schema into versioned migrations
--
-- Problem: the ten vote tables, three SECURITY DEFINER helpers and their triggers existed
-- only in the live project. A rebuilt database did not contain them, so the schema was not
-- reproducible from Git and the SAN-1484 hardening was a no-op on a fresh rebuild.
--
-- Provenance: every definition was read from the live catalogue with
--   npx supabase db dump --schema vote --db-url $SUPABASE_DB_URL
-- on 2026-10-14 (origin/main 42f50d3bb). Nothing is hand-invented.
--
-- Idempotency: create table if not exists skips an existing table; pg_dump's separate
--   ALTER TABLE ... ADD CONSTRAINT statements are guarded with a pg_constraint existence
--   check; indexes use if not exists; policies are dropped-if-exists first; functions and
--   triggers use create or replace. The migration is a NO-OP on production.
--
-- Hardening preserved: the revokes at the end repeat the SAN-1484 outcome so a fresh
--   rebuild cannot inherit default end-user grants on vote.entities or PUBLIC EXECUTE.

set check_function_bodies = false;
set search_path = public, extensions;
CREATE SCHEMA IF NOT EXISTS "vote";


ALTER SCHEMA "vote" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "vote"."recompute_entity_tally"("p_entity_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vote', 'public'
    AS $$
DECLARE
  v_contest_id      uuid;
  v_formula         jsonb;
  v_w_audience      numeric;
  v_w_judges        numeric;
  v_audience_votes  bigint;
  v_paid_votes      bigint;
  v_max_audience    bigint;
  v_audience_norm   numeric;
  v_judge_norm      numeric;
  v_weighted        numeric;
  v_trend_24h       numeric;
BEGIN
  SELECT e.contest_id, c.scoring_formula
  INTO v_contest_id, v_formula
  FROM vote.entities e
  JOIN vote.contests c ON c.id = e.contest_id
  WHERE e.id = p_entity_id;

  IF v_contest_id IS NULL THEN RETURN; END IF;

  v_w_audience := COALESCE((v_formula->>'audience')::numeric, 0.5);
  v_w_judges   := COALESCE((v_formula->>'judges')::numeric, 0.3);

  SELECT
    COUNT(*) FILTER (WHERE source = 'audience' AND fraud_status <> 'blocked'),
    COUNT(*) FILTER (WHERE source = 'paid')
  INTO v_audience_votes, v_paid_votes
  FROM vote.votes
  WHERE entity_id = p_entity_id;

  SELECT COALESCE(MAX(sub.cnt), 1)
  INTO v_max_audience
  FROM (
    SELECT COUNT(*) FILTER (WHERE source = 'audience' AND fraud_status <> 'blocked') AS cnt
    FROM vote.votes
    WHERE contest_id = v_contest_id
    GROUP BY entity_id
  ) sub;

  v_audience_norm := v_audience_votes::numeric / v_max_audience::numeric;

  SELECT COALESCE(
    SUM(js.score * sc.weight_pct::numeric / 100.0)
    / NULLIF(SUM(sc.weight_pct::numeric / 100.0 * sc.max_score::numeric), 0),
    0
  )
  INTO v_judge_norm
  FROM vote.judge_scores js
  JOIN vote.scoring_criteria sc ON sc.id = js.criterion_id
  WHERE js.entity_id = p_entity_id;

  v_weighted := (v_audience_norm * v_w_audience) + (v_judge_norm * v_w_judges);

  SELECT COUNT(*) FILTER (
    WHERE source = 'audience'
      AND fraud_status <> 'blocked'
      AND created_at >= NOW() - interval '24 hours'
  )
  INTO v_trend_24h
  FROM vote.votes
  WHERE entity_id = p_entity_id;

  INSERT INTO vote.entity_tally (
    entity_id, contest_id,
    audience_votes, paid_votes,
    judge_score, weighted_total, trend_24h,
    updated_at
  ) VALUES (
    p_entity_id, v_contest_id,
    v_audience_votes, v_paid_votes,
    v_judge_norm, v_weighted, v_trend_24h,
    NOW()
  )
  ON CONFLICT (entity_id) DO UPDATE SET
    audience_votes = EXCLUDED.audience_votes,
    paid_votes     = EXCLUDED.paid_votes,
    judge_score    = EXCLUDED.judge_score,
    weighted_total = EXCLUDED.weighted_total,
    trend_24h      = EXCLUDED.trend_24h,
    updated_at     = NOW();

  WITH ranked AS (
    SELECT entity_id,
           DENSE_RANK() OVER (ORDER BY weighted_total DESC) AS rnk
    FROM vote.entity_tally
    WHERE contest_id = v_contest_id
  )
  UPDATE vote.entity_tally et
  SET rank = r.rnk
  FROM ranked r
  WHERE et.entity_id = r.entity_id
    AND et.contest_id = v_contest_id;
END;
$$;


ALTER FUNCTION "vote"."recompute_entity_tally"("p_entity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "vote"."trigger_recompute_on_judge_score"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vote', 'public'
    AS $$
BEGIN
  PERFORM vote.recompute_entity_tally(NEW.entity_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "vote"."trigger_recompute_on_judge_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "vote"."trigger_recompute_on_vote"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'vote', 'public'
    AS $$
BEGIN
  PERFORM vote.recompute_entity_tally(NEW.entity_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "vote"."trigger_recompute_on_vote"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "vote"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "vote"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."contests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "cover_url" "text",
    "event_id" "uuid",
    "org_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "free_votes_per_user_per_day" integer DEFAULT 1 NOT NULL,
    "paid_votes_enabled" boolean DEFAULT false NOT NULL,
    "judge_weight_pct" integer DEFAULT 30 NOT NULL,
    "scoring_formula" "jsonb" DEFAULT '{"judges": 0.3, "audience": 0.5, "engagement": 0.2}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contests_judge_weight_pct_check" CHECK ((("judge_weight_pct" >= 0) AND ("judge_weight_pct" <= 100))),
    CONSTRAINT "contests_kind_check" CHECK (("kind" = ANY (ARRAY['pageant'::"text", 'restaurant'::"text", 'event'::"text", 'generic'::"text"]))),
    CONSTRAINT "contests_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'live'::"text", 'closed'::"text", 'archived'::"text"])))
);


ALTER TABLE "vote"."contests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "slug" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "bio" "text",
    "hero_url" "text",
    "media" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "socials" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "embedding" vector(768),
    "approved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "submitted_at" timestamp with time zone,
    "created_by_user_id" "uuid",
    "id_front_url" "text",
    "id_back_url" "text",
    "waiver_url" "text",
    "ai_moderation_status" "text" DEFAULT 'pending'::"text",
    "ai_moderation_categories" "text"[] DEFAULT '{}'::"text"[],
    "ai_moderation_at" timestamp with time zone,
    "identity_verified_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "ai_flag_override_by" "uuid",
    "ai_flag_override_note" "text"
);


ALTER TABLE "vote"."entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."entity_tally" (
    "entity_id" "uuid" NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "audience_votes" bigint DEFAULT 0 NOT NULL,
    "paid_votes" bigint DEFAULT 0 NOT NULL,
    "judge_score" numeric(8,3) DEFAULT 0 NOT NULL,
    "weighted_total" numeric(12,3) DEFAULT 0 NOT NULL,
    "rank" integer,
    "trend_24h" numeric(8,3) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "vote"."entity_tally" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."fraud_signals" (
    "vote_id" "uuid" NOT NULL,
    "rules_hit" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "ai_label" "text",
    "ai_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "vote"."fraud_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."judge_scores" (
    "contest_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "judge_id" "uuid" NOT NULL,
    "criterion_id" "uuid" NOT NULL,
    "score" numeric(5,2) NOT NULL,
    "comment" "text",
    "ai_assist_score" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "vote"."judge_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."judges" (
    "contest_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weight" numeric(4,2) DEFAULT 1.0 NOT NULL,
    "invited_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "vote"."judges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."paid_vote_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stripe_session_id" "text",
    "contest_id" "uuid",
    "entity_id" "uuid",
    "buyer_user_id" "uuid",
    "votes_purchased" integer NOT NULL,
    "votes_credited" integer DEFAULT 0 NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'COP'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "paid_vote_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'credited'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "vote"."paid_vote_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."scoring_criteria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "weight_pct" integer NOT NULL,
    "max_score" integer DEFAULT 10 NOT NULL,
    CONSTRAINT "scoring_criteria_weight_pct_check" CHECK ((("weight_pct" >= 0) AND ("weight_pct" <= 100)))
);


ALTER TABLE "vote"."scoring_criteria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "vote"."votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contest_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "voter_user_id" "uuid",
    "voter_anon_id" "text",
    "weight" numeric(6,3) DEFAULT 1.000 NOT NULL,
    "source" "text" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "device_hash" "text",
    "user_agent" "text",
    "country" "text",
    "fraud_score" numeric(4,3),
    "fraud_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "votes_fraud_status_check" CHECK (("fraud_status" = ANY (ARRAY['pending'::"text", 'clean'::"text", 'suspicious'::"text", 'blocked'::"text"]))),
    CONSTRAINT "votes_source_check" CHECK (("source" = ANY (ARRAY['audience'::"text", 'judge'::"text", 'paid'::"text"])))
);


ALTER TABLE "vote"."votes" OWNER TO "postgres";


do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categories_contest_id_slug_key' and conrelid = 'vote.categories'::regclass) then
    alter table only "vote"."categories" add constraint "categories_contest_id_slug_key" UNIQUE ("contest_id", "slug");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categories_pkey' and conrelid = 'vote.categories'::regclass) then
    alter table only "vote"."categories" add constraint "categories_pkey" PRIMARY KEY ("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contests_pkey' and conrelid = 'vote.contests'::regclass) then
    alter table only "vote"."contests" add constraint "contests_pkey" PRIMARY KEY ("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contests_slug_key' and conrelid = 'vote.contests'::regclass) then
    alter table only "vote"."contests" add constraint "contests_slug_key" UNIQUE ("slug");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entities_contest_id_slug_key' and conrelid = 'vote.entities'::regclass) then
    alter table only "vote"."entities" add constraint "entities_contest_id_slug_key" UNIQUE ("contest_id", "slug");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entities_pkey' and conrelid = 'vote.entities'::regclass) then
    alter table only "vote"."entities" add constraint "entities_pkey" PRIMARY KEY ("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entity_tally_pkey' and conrelid = 'vote.entity_tally'::regclass) then
    alter table only "vote"."entity_tally" add constraint "entity_tally_pkey" PRIMARY KEY ("entity_id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fraud_signals_pkey' and conrelid = 'vote.fraud_signals'::regclass) then
    alter table only "vote"."fraud_signals" add constraint "fraud_signals_pkey" PRIMARY KEY ("vote_id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'judge_scores_pkey' and conrelid = 'vote.judge_scores'::regclass) then
    alter table only "vote"."judge_scores" add constraint "judge_scores_pkey" PRIMARY KEY ("contest_id", "entity_id", "judge_id", "criterion_id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'judges_pkey' and conrelid = 'vote.judges'::regclass) then
    alter table only "vote"."judges" add constraint "judges_pkey" PRIMARY KEY ("contest_id", "user_id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'paid_vote_orders_pkey' and conrelid = 'vote.paid_vote_orders'::regclass) then
    alter table only "vote"."paid_vote_orders" add constraint "paid_vote_orders_pkey" PRIMARY KEY ("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scoring_criteria_contest_id_key_key' and conrelid = 'vote.scoring_criteria'::regclass) then
    alter table only "vote"."scoring_criteria" add constraint "scoring_criteria_contest_id_key_key" UNIQUE ("contest_id", "key");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scoring_criteria_pkey' and conrelid = 'vote.scoring_criteria'::regclass) then
    alter table only "vote"."scoring_criteria" add constraint "scoring_criteria_pkey" PRIMARY KEY ("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'votes_pkey' and conrelid = 'vote.votes'::regclass) then
    alter table only "vote"."votes" add constraint "votes_pkey" PRIMARY KEY ("id");
  end if;
end $$;



create index if not exists "idx_vote_entities_ai_flag_override_by" on "vote"."entities" USING "btree" ("ai_flag_override_by");



create index if not exists "idx_vote_entities_reviewed_by" on "vote"."entities" USING "btree" ("reviewed_by");



create index if not exists "vote_categories_contest_idx" on "vote"."categories" USING "btree" ("contest_id");



create index if not exists "vote_contests_event_idx" on "vote"."contests" USING "btree" ("event_id") WHERE ("event_id" IS NOT NULL);



create index if not exists "vote_contests_org_idx" on "vote"."contests" USING "btree" ("org_id");



create index if not exists "vote_contests_status_idx" on "vote"."contests" USING "btree" ("status");



create index if not exists "vote_entities_ai_mod_status_idx" on "vote"."entities" USING "btree" ("ai_moderation_status") WHERE ("ai_moderation_status" = ANY (ARRAY['flagged'::"text", 'rejected'::"text"]));



create index if not exists "vote_entities_approved_idx" on "vote"."entities" USING "btree" ("contest_id", "approved");



create index if not exists "vote_entities_category_idx" on "vote"."entities" USING "btree" ("category_id") WHERE ("category_id" IS NOT NULL);



create index if not exists "vote_entities_contest_idx" on "vote"."entities" USING "btree" ("contest_id");



create index if not exists "vote_entities_created_by_idx" on "vote"."entities" USING "btree" ("created_by_user_id") WHERE ("created_by_user_id" IS NOT NULL);



create index if not exists "vote_entities_embedding_idx" on "vote"."entities" USING "ivfflat" ("embedding" vector_cosine_ops) WITH ("lists"='100');



create index if not exists "vote_entities_rejected_idx" on "vote"."entities" USING "btree" ("contest_id", "approved") WHERE ("rejection_reason" IS NOT NULL);



create index if not exists "vote_entities_submitted_idx" on "vote"."entities" USING "btree" ("submitted_at") WHERE ("submitted_at" IS NOT NULL);



create index if not exists "vote_entity_tally_leaderboard_idx" on "vote"."entity_tally" USING "btree" ("contest_id", "weighted_total" DESC);



create index if not exists "vote_fraud_signals_reviewed_by_idx" on "vote"."fraud_signals" USING "btree" ("reviewed_by") WHERE ("reviewed_by" IS NOT NULL);



create index if not exists "vote_judge_scores_criterion_idx" on "vote"."judge_scores" USING "btree" ("criterion_id");



create index if not exists "vote_judge_scores_entity_idx" on "vote"."judge_scores" USING "btree" ("entity_id");



create index if not exists "vote_judge_scores_judge_idx" on "vote"."judge_scores" USING "btree" ("judge_id");



create index if not exists "vote_judges_user_idx" on "vote"."judges" USING "btree" ("user_id");



create index if not exists "vote_paid_orders_buyer_idx" on "vote"."paid_vote_orders" USING "btree" ("buyer_user_id");



create index if not exists "vote_paid_orders_contest_idx" on "vote"."paid_vote_orders" USING "btree" ("contest_id");



create index if not exists "vote_paid_orders_entity_idx" on "vote"."paid_vote_orders" USING "btree" ("entity_id") WHERE ("entity_id" IS NOT NULL);



create index if not exists "vote_scoring_criteria_contest_idx" on "vote"."scoring_criteria" USING "btree" ("contest_id");



create index if not exists "vote_votes_contest_entity_idx" on "vote"."votes" USING "btree" ("contest_id", "entity_id", "created_at" DESC);



create index if not exists "vote_votes_entity_idx" on "vote"."votes" USING "btree" ("entity_id");



create index if not exists "vote_votes_fraud_status_idx" on "vote"."votes" USING "btree" ("contest_id", "fraud_status") WHERE ("fraud_status" <> 'clean'::"text");



create unique index if not exists "vote_votes_idempotency_idx" on "vote"."votes" USING "btree" ("idempotency_key");



create index if not exists "vote_votes_ip_hash_idx" on "vote"."votes" USING "btree" ("ip_hash", "contest_id", "created_at");



create index if not exists "vote_votes_voter_user_idx" on "vote"."votes" USING "btree" ("voter_user_id", "contest_id", "created_at") WHERE ("voter_user_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "tr_recompute_tally_on_judge_score" AFTER INSERT OR UPDATE ON "vote"."judge_scores" FOR EACH ROW EXECUTE FUNCTION "vote"."trigger_recompute_on_judge_score"();



CREATE OR REPLACE TRIGGER "tr_recompute_tally_on_vote" AFTER INSERT ON "vote"."votes" FOR EACH ROW EXECUTE FUNCTION "vote"."trigger_recompute_on_vote"();



CREATE OR REPLACE TRIGGER "vote_contests_set_updated_at" BEFORE UPDATE ON "vote"."contests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vote_entities_set_updated_at" BEFORE UPDATE ON "vote"."entities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vote_judge_scores_set_updated_at" BEFORE UPDATE ON "vote"."judge_scores" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vote_paid_orders_set_updated_at" BEFORE UPDATE ON "vote"."paid_vote_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "vote_tally_broadcast_trigger" AFTER INSERT OR UPDATE ON "vote"."entity_tally" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_vote_tally_changes"();



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categories_contest_id_fkey' and conrelid = 'vote.categories'::regclass) then
    alter table only "vote"."categories" add constraint "categories_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "vote"."contests"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contests_event_id_fkey' and conrelid = 'vote.contests'::regclass) then
    alter table only "vote"."contests" add constraint "contests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contests_org_id_fkey' and conrelid = 'vote.contests'::regclass) then
    alter table only "vote"."contests" add constraint "contests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."profiles"("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entities_ai_flag_override_by_fkey' and conrelid = 'vote.entities'::regclass) then
    alter table only "vote"."entities" add constraint "entities_ai_flag_override_by_fkey" FOREIGN KEY ("ai_flag_override_by") REFERENCES "auth"."users"("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entities_category_id_fkey' and conrelid = 'vote.entities'::regclass) then
    alter table only "vote"."entities" add constraint "entities_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "vote"."categories"("id") ON DELETE SET NULL;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entities_contest_id_fkey' and conrelid = 'vote.entities'::regclass) then
    alter table only "vote"."entities" add constraint "entities_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "vote"."contests"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entities_created_by_user_id_fkey' and conrelid = 'vote.entities'::regclass) then
    alter table only "vote"."entities" add constraint "entities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entities_reviewed_by_fkey' and conrelid = 'vote.entities'::regclass) then
    alter table only "vote"."entities" add constraint "entities_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entity_tally_contest_id_fkey' and conrelid = 'vote.entity_tally'::regclass) then
    alter table only "vote"."entity_tally" add constraint "entity_tally_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "vote"."contests"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entity_tally_entity_id_fkey' and conrelid = 'vote.entity_tally'::regclass) then
    alter table only "vote"."entity_tally" add constraint "entity_tally_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "vote"."entities"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fraud_signals_reviewed_by_fkey' and conrelid = 'vote.fraud_signals'::regclass) then
    alter table only "vote"."fraud_signals" add constraint "fraud_signals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fraud_signals_vote_id_fkey' and conrelid = 'vote.fraud_signals'::regclass) then
    alter table only "vote"."fraud_signals" add constraint "fraud_signals_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "vote"."votes"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'judge_scores_contest_id_fkey' and conrelid = 'vote.judge_scores'::regclass) then
    alter table only "vote"."judge_scores" add constraint "judge_scores_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "vote"."contests"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'judge_scores_criterion_id_fkey' and conrelid = 'vote.judge_scores'::regclass) then
    alter table only "vote"."judge_scores" add constraint "judge_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "vote"."scoring_criteria"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'judge_scores_entity_id_fkey' and conrelid = 'vote.judge_scores'::regclass) then
    alter table only "vote"."judge_scores" add constraint "judge_scores_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "vote"."entities"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'judge_scores_judge_id_fkey' and conrelid = 'vote.judge_scores'::regclass) then
    alter table only "vote"."judge_scores" add constraint "judge_scores_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'judges_contest_id_fkey' and conrelid = 'vote.judges'::regclass) then
    alter table only "vote"."judges" add constraint "judges_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "vote"."contests"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'judges_user_id_fkey' and conrelid = 'vote.judges'::regclass) then
    alter table only "vote"."judges" add constraint "judges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'paid_vote_orders_buyer_user_id_fkey' and conrelid = 'vote.paid_vote_orders'::regclass) then
    alter table only "vote"."paid_vote_orders" add constraint "paid_vote_orders_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "auth"."users"("id");
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'paid_vote_orders_contest_id_fkey' and conrelid = 'vote.paid_vote_orders'::regclass) then
    alter table only "vote"."paid_vote_orders" add constraint "paid_vote_orders_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "vote"."contests"("id") ON DELETE SET NULL;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'paid_vote_orders_entity_id_fkey' and conrelid = 'vote.paid_vote_orders'::regclass) then
    alter table only "vote"."paid_vote_orders" add constraint "paid_vote_orders_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "vote"."entities"("id") ON DELETE SET NULL;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'scoring_criteria_contest_id_fkey' and conrelid = 'vote.scoring_criteria'::regclass) then
    alter table only "vote"."scoring_criteria" add constraint "scoring_criteria_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "vote"."contests"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'votes_contest_id_fkey' and conrelid = 'vote.votes'::regclass) then
    alter table only "vote"."votes" add constraint "votes_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "vote"."contests"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'votes_entity_id_fkey' and conrelid = 'vote.votes'::regclass) then
    alter table only "vote"."votes" add constraint "votes_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "vote"."entities"("id") ON DELETE CASCADE;
  end if;
end $$;



do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'votes_voter_user_id_fkey' and conrelid = 'vote.votes'::regclass) then
    alter table only "vote"."votes" add constraint "votes_voter_user_id_fkey" FOREIGN KEY ("voter_user_id") REFERENCES "auth"."users"("id");
  end if;
end $$;



ALTER TABLE "vote"."categories" ENABLE ROW LEVEL SECURITY;


drop policy if exists "categories_org_delete" on "vote"."categories";
create policy "categories_org_delete" on "vote"."categories" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "categories"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "categories_org_update" on "vote"."categories";
create policy "categories_org_update" on "vote"."categories" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "categories"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "categories_org_write" on "vote"."categories";
create policy "categories_org_write" on "vote"."categories" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "categories"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "categories_select" on "vote"."categories";
create policy "categories_select" on "vote"."categories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "categories"."contest_id") AND (("c"."status" = ANY (ARRAY['live'::"text", 'closed'::"text"])) OR ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "vote"."contests" ENABLE ROW LEVEL SECURITY;


drop policy if exists "contests_org_delete" on "vote"."contests";
create policy "contests_org_delete" on "vote"."contests" FOR DELETE USING (("org_id" = ( SELECT "auth"."uid"() AS "uid")));



drop policy if exists "contests_org_update" on "vote"."contests";
create policy "contests_org_update" on "vote"."contests" FOR UPDATE USING (("org_id" = ( SELECT "auth"."uid"() AS "uid")));



drop policy if exists "contests_org_write" on "vote"."contests";
create policy "contests_org_write" on "vote"."contests" FOR INSERT WITH CHECK (("org_id" = ( SELECT "auth"."uid"() AS "uid")));



drop policy if exists "contests_select" on "vote"."contests";
create policy "contests_select" on "vote"."contests" FOR SELECT USING ((("status" = ANY (ARRAY['live'::"text", 'closed'::"text"])) OR ("org_id" = ( SELECT "auth"."uid"() AS "uid"))));



drop policy if exists "criteria_org_delete" on "vote"."scoring_criteria";
create policy "criteria_org_delete" on "vote"."scoring_criteria" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "scoring_criteria"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "criteria_org_update" on "vote"."scoring_criteria";
create policy "criteria_org_update" on "vote"."scoring_criteria" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "scoring_criteria"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "criteria_org_write" on "vote"."scoring_criteria";
create policy "criteria_org_write" on "vote"."scoring_criteria" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "scoring_criteria"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "criteria_select" on "vote"."scoring_criteria";
create policy "criteria_select" on "vote"."scoring_criteria" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "scoring_criteria"."contest_id") AND (("c"."status" = ANY (ARRAY['live'::"text", 'closed'::"text"])) OR ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "vote"."entities" ENABLE ROW LEVEL SECURITY;


drop policy if exists "entities_admin_select" on "vote"."entities";
create policy "entities_admin_select" on "vote"."entities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



drop policy if exists "entities_admin_update" on "vote"."entities";
create policy "entities_admin_update" on "vote"."entities" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



drop policy if exists "entities_contestant_insert" on "vote"."entities";
create policy "entities_contestant_insert" on "vote"."entities" FOR INSERT WITH CHECK ((("created_by_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("approved" = false)));



drop policy if exists "entities_contestant_select" on "vote"."entities";
create policy "entities_contestant_select" on "vote"."entities" FOR SELECT USING (("created_by_user_id" = ( SELECT "auth"."uid"() AS "uid")));



drop policy if exists "entities_contestant_update" on "vote"."entities";
create policy "entities_contestant_update" on "vote"."entities" FOR UPDATE USING ((("created_by_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("approved" = false)));



drop policy if exists "entities_org_delete" on "vote"."entities";
create policy "entities_org_delete" on "vote"."entities" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "entities"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "entities_org_update" on "vote"."entities";
create policy "entities_org_update" on "vote"."entities" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "entities"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "entities_org_write" on "vote"."entities";
create policy "entities_org_write" on "vote"."entities" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "entities"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



drop policy if exists "entities_select" on "vote"."entities";
create policy "entities_select" on "vote"."entities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "entities"."contest_id") AND (("c"."org_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("c"."status" = ANY (ARRAY['live'::"text", 'closed'::"text"])) AND ("entities"."approved" = true)))))));



ALTER TABLE "vote"."entity_tally" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "vote"."fraud_signals" ENABLE ROW LEVEL SECURITY;


drop policy if exists "fraud_signals_org_select" on "vote"."fraud_signals";
create policy "fraud_signals_org_select" on "vote"."fraud_signals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("vote"."votes" "v"
     JOIN "vote"."contests" "c" ON (("c"."id" = "v"."contest_id")))
  WHERE (("v"."id" = "fraud_signals"."vote_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "vote"."judge_scores" ENABLE ROW LEVEL SECURITY;


drop policy if exists "judge_scores_judge_update" on "vote"."judge_scores";
create policy "judge_scores_judge_update" on "vote"."judge_scores" FOR UPDATE USING ((("judge_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "vote"."judges" "j"
  WHERE (("j"."contest_id" = "judge_scores"."contest_id") AND ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



drop policy if exists "judge_scores_judge_write" on "vote"."judge_scores";
create policy "judge_scores_judge_write" on "vote"."judge_scores" FOR INSERT WITH CHECK ((("judge_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "vote"."judges" "j"
  WHERE (("j"."contest_id" = "judge_scores"."contest_id") AND ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



drop policy if exists "judge_scores_select" on "vote"."judge_scores";
create policy "judge_scores_select" on "vote"."judge_scores" FOR SELECT USING ((("judge_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "judge_scores"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "vote"."judges" ENABLE ROW LEVEL SECURITY;


drop policy if exists "judges_select" on "vote"."judges";
create policy "judges_select" on "vote"."judges" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "judges"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid")))))));



drop policy if exists "paid_orders_select" on "vote"."paid_vote_orders";
create policy "paid_orders_select" on "vote"."paid_vote_orders" FOR SELECT USING ((("buyer_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "paid_vote_orders"."contest_id") AND ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "vote"."paid_vote_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "vote"."scoring_criteria" ENABLE ROW LEVEL SECURITY;


drop policy if exists "tally_select" on "vote"."entity_tally";
create policy "tally_select" on "vote"."entity_tally" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "vote"."contests" "c"
  WHERE (("c"."id" = "entity_tally"."contest_id") AND (("c"."status" = ANY (ARRAY['live'::"text", 'closed'::"text"])) OR ("c"."org_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "vote"."votes" ENABLE ROW LEVEL SECURITY;


drop policy if exists "votes_own_select" on "vote"."votes";
create policy "votes_own_select" on "vote"."votes" FOR SELECT USING (("voter_user_id" = ( SELECT "auth"."uid"() AS "uid")));



GRANT USAGE ON SCHEMA "vote" TO "anon";
GRANT USAGE ON SCHEMA "vote" TO "authenticated";



REVOKE ALL ON FUNCTION "vote"."recompute_entity_tally"("p_entity_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "vote"."trigger_recompute_on_judge_score"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "vote"."trigger_recompute_on_vote"() FROM PUBLIC;



GRANT SELECT ON TABLE "vote"."contests" TO "anon";
GRANT SELECT ON TABLE "vote"."contests" TO "authenticated";



GRANT SELECT ON TABLE "vote"."entity_tally" TO "anon";
GRANT SELECT ON TABLE "vote"."entity_tally" TO "authenticated";

-- preserve the SAN-1484 hardened privileges on fresh rebuilds
-- 20261014174712_vote_entities_projection_and_privileges.sql is guarded with
-- to_regclass/to_regprocedure, so it is a no-op when it runs before this migration
-- creates the objects. Repeating the revokes here guarantees a fresh rebuild matches
-- production: no end-user table access on vote.entities, no PUBLIC/end-user EXECUTE.
revoke all on table vote.entities from public, anon, authenticated;
revoke all on function vote.recompute_entity_tally(uuid) from public, anon, authenticated;
revoke all on function vote.trigger_recompute_on_vote() from public, anon, authenticated;
revoke all on function vote.trigger_recompute_on_judge_score() from public, anon, authenticated;
