-- SAN-1523 · MDE AI — Process Embedding Jobs Reliably and Keep Semantic Search Current (PR 1 of 2)
--
-- WHY
-- public.embedding_jobs (DATA-040) has 96 jobs that were never attempted: nothing consumes the queue, and
-- the enqueue triggers are wrong for development. Apartments need moderation_status = 'approved', events
-- and restaurants need is_active (business gates); the change fingerprint is md5(title || description || id),
-- so editing the neighborhood or amenities never refreshes a vector. This migration fixes the SOURCE of
-- the queue and adds the three service-only functions the Edge worker (supabase/functions/process-embedding-jobs)
-- needs. The recurring schedule is deliberately NOT here: it ships in a second migration after the worker
-- has processed real jobs by hand.
--
-- TIMESTAMP
-- Not the `supabase migration new` default: that stamp (20261016103922) sorts BEFORE the newest migration
-- already applied in production (20261016110100), which `db push` refuses. This one sorts after it.
--
-- WHAT IT DOES
--   1. embedding_jobs: lease_token, lease_expires_at, next_attempt_at (claim + retry state).
--   2. public.embedding_document_for_entity(): ONE factual document + content hash per entity, used by both
--      the trigger and the worker, so they can never disagree. Facts only: no ids, urls, prices, ratings.
--   3. public.enqueue_embedding_job(): no business gates; fires on every semantic field; one pending job per
--      (entity, hash); older pending jobs for the entity are superseded.
--   4. claim_embedding_jobs / complete_embedding_job / fail_embedding_job: FOR UPDATE SKIP LOCKED claim with
--      a lease, atomic compare-and-upsert on completion (a stale vector can never overwrite a newer edit),
--      bounded retries with backoff. EXECUTE is granted to service_role only.
--   5. One-time queue rebuild: the 96 stale jobs become `skipped` (history kept); one fresh job per entity
--      whose stored vector does not match its current document.
--
-- Model contract (kept in sync with src/mastra/lib/query-embedding.ts by a unit test):
--   gemini-embedding-001, 768 dimensions. Document version tag: v1.

-- 1 · queue state ----------------------------------------------------------------------------------------
ALTER TABLE public.embedding_jobs
  ADD COLUMN IF NOT EXISTS lease_token      uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at  timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS embedding_jobs_claim_idx
  ON public.embedding_jobs (next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');

-- 2 · the one factual document ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: it only reads the three catalogue tables and is called by the definer
-- trigger (as the owner) and by service_role. anon/authenticated get no EXECUTE.
CREATE OR REPLACE FUNCTION public.embedding_document_for_entity(p_entity_type text, p_entity_id uuid)
RETURNS TABLE (content_text text, content_hash text)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $fn$
DECLARE
  v_text text;
BEGIN
  IF p_entity_type = 'apartment' THEN
    SELECT nullif(concat_ws(E'\n',
             nullif(btrim(a.title), ''),
             nullif(btrim(concat_ws(', ', a.neighborhood, a.city)), ''),
             CASE WHEN a.bedrooms = 0 THEN 'Studio'
                  WHEN a.bedrooms = 1 THEN '1 bedroom'
                  WHEN a.bedrooms > 1 THEN a.bedrooms::text || ' bedrooms' END,
             nullif(btrim(a.description), ''),
             CASE WHEN cardinality(a.amenities) > 0 THEN 'Amenities: ' || array_to_string(a.amenities, ', ') END,
             CASE WHEN a.furnished THEN 'Furnished' END,
             CASE WHEN a.pet_friendly THEN 'Pet friendly' END), '')
      INTO v_text
      FROM public.apartments a WHERE a.id = p_entity_id;
  ELSIF p_entity_type = 'event' THEN
    SELECT nullif(concat_ws(E'\n',
             nullif(btrim(e.name), ''),
             nullif(btrim(e.event_type), ''),
             nullif(btrim(e.description), ''),
             CASE WHEN cardinality(e.tags) > 0 THEN 'Tags: ' || array_to_string(e.tags, ', ') END,
             nullif(btrim(e.address), '')), '')
      INTO v_text
      FROM public.events e WHERE e.id = p_entity_id;
  ELSIF p_entity_type = 'restaurant' THEN
    SELECT nullif(concat_ws(E'\n',
             nullif(btrim(r.name), ''),
             nullif(btrim(r.description), ''),
             CASE WHEN cardinality(r.cuisine_types) > 0 THEN 'Cuisine: ' || array_to_string(r.cuisine_types, ', ') END,
             CASE WHEN cardinality(r.ambiance) > 0 THEN 'Ambiance: ' || array_to_string(r.ambiance, ', ') END,
             CASE WHEN cardinality(r.tags) > 0 THEN 'Tags: ' || array_to_string(r.tags, ', ') END,
             nullif(btrim(r.address), ''),
             CASE WHEN r.price_level IS NOT NULL THEN 'Price level: ' || r.price_level::text END), '')
      INTO v_text
      FROM public.restaurants r WHERE r.id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'embedding_document_for_entity: unknown entity type %', p_entity_type;
  END IF;

  IF v_text IS NULL THEN
    RETURN; -- no such row, or nothing factual to embed
  END IF;
  -- gemini-embedding-001 reads at most 2048 tokens per text. 6000 characters stays under that even at
  -- ~3 characters per token, so an unusually long description can never turn into a failed request.
  -- ponytail: a plain character cap; switch to a token-aware cut only if real records need the tail.
  v_text := left(v_text, 6000);
  -- model, dimensions and document version are part of the hash: changing any of them re-embeds everything.
  RETURN QUERY SELECT v_text, md5(v_text || E'\n' || 'gemini-embedding-001:768:v1');
END
$fn$;

-- 3 · enqueue: no business gates, every semantic field ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_embedding_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_type    text;
  v_hash    text;
  v_current text;
BEGIN
  v_type := CASE TG_TABLE_NAME
              WHEN 'apartments'  THEN 'apartment'
              WHEN 'events'      THEN 'event'
              WHEN 'restaurants' THEN 'restaurant'
            END;
  IF v_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT d.content_hash INTO v_hash FROM public.embedding_document_for_entity(v_type, NEW.id) d;
  IF v_hash IS NULL THEN
    -- Nothing factual is left to embed. A stored vector would describe text that no longer exists, so remove it
    -- and close any open job. A job already running loses its lease here, so its late result is discarded
    -- ('lost_lease'); complete_embedding_job also re-checks the document hash before writing anything.
    UPDATE public.embedding_jobs
       SET status = 'skipped', last_error = 'entity has no text to embed',
           lease_token = NULL, lease_expires_at = NULL, processed_at = now(), updated_at = now()
     WHERE entity_type = v_type AND entity_id = NEW.id AND status IN ('pending', 'processing');
    IF v_type = 'apartment' THEN
      DELETE FROM public.listing_embeddings WHERE listing_id = NEW.id;
    ELSIF v_type = 'event' THEN
      DELETE FROM public.event_embeddings WHERE event_id = NEW.id;
    ELSE
      DELETE FROM public.restaurant_embeddings WHERE restaurant_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  v_current := CASE v_type
    WHEN 'apartment'  THEN (SELECT e.content_hash FROM public.listing_embeddings    e WHERE e.listing_id    = NEW.id)
    WHEN 'event'      THEN (SELECT e.content_hash FROM public.event_embeddings      e WHERE e.event_id      = NEW.id)
    WHEN 'restaurant' THEN (SELECT e.content_hash FROM public.restaurant_embeddings e WHERE e.restaurant_id = NEW.id)
  END;
  IF v_current IS NOT DISTINCT FROM v_hash THEN
    RETURN NEW; -- the stored vector already matches this exact document
  END IF;

  INSERT INTO public.embedding_jobs (entity_type, entity_id, content_hash, status)
  VALUES (v_type, NEW.id, v_hash, 'pending')
  ON CONFLICT DO NOTHING;

  -- an older pending job for this entity describes text that no longer exists
  UPDATE public.embedding_jobs
     SET status = 'skipped', last_error = 'superseded by a newer version of the document',
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE entity_type = v_type AND entity_id = NEW.id
     AND status = 'pending' AND content_hash <> v_hash;

  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_embedding_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enqueue_embed_apartment  ON public.apartments;
DROP TRIGGER IF EXISTS trg_enqueue_embed_event      ON public.events;
DROP TRIGGER IF EXISTS trg_enqueue_embed_restaurant ON public.restaurants;

CREATE TRIGGER trg_enqueue_embed_apartment
  AFTER INSERT OR UPDATE OF title, description, neighborhood, city, bedrooms, amenities, furnished, pet_friendly
  ON public.apartments
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

CREATE TRIGGER trg_enqueue_embed_event
  AFTER INSERT OR UPDATE OF name, description, event_type, tags, address
  ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

CREATE TRIGGER trg_enqueue_embed_restaurant
  AFTER INSERT OR UPDATE OF name, description, cuisine_types, ambiance, tags, address, price_level
  ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_embedding_job();

-- 4 · claim / complete / fail (service_role only) ----------------------------------------------------------
-- Not SECURITY DEFINER: they run with the caller's own privileges, and only service_role can call them.
CREATE OR REPLACE FUNCTION public.claim_embedding_jobs(p_limit integer DEFAULT 5)
RETURNS TABLE (job_id uuid, entity_type text, entity_id uuid, content_hash text, model text,
               dimensions integer, lease_token uuid, attempts integer)
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_token uuid := gen_random_uuid();
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 10);
BEGIN
  -- a worker that died on its last allowed attempt: stop retrying, keep the reason
  UPDATE public.embedding_jobs j
     SET status = 'failed', last_error = 'worker lease expired on the last allowed attempt',
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE j.status = 'processing' AND j.lease_expires_at < now() AND j.attempts >= 5;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
      FROM public.embedding_jobs j
     WHERE j.attempts < 5
       AND ((j.status = 'pending' AND j.next_attempt_at <= now())
         OR (j.status = 'processing' AND j.lease_expires_at < now()))
     ORDER BY j.created_at
     LIMIT v_limit
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.embedding_jobs j
     SET status = 'processing', attempts = j.attempts + 1, lease_token = v_token,
         lease_expires_at = now() + interval '5 minutes', updated_at = now()
    FROM picked
   WHERE j.id = picked.id
  RETURNING j.id, j.entity_type, j.entity_id, j.content_hash, j.model, j.dimensions, j.lease_token, j.attempts;
END
$fn$;

CREATE OR REPLACE FUNCTION public.complete_embedding_job(
  p_job_id uuid, p_lease_token uuid, p_values double precision[])
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  j      public.embedding_jobs%ROWTYPE;
  v_hash text;
BEGIN
  SELECT * INTO j FROM public.embedding_jobs
   WHERE id = p_job_id AND lease_token = p_lease_token AND status = 'processing'
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'lost_lease'; -- someone else owns it, or it already finished: do nothing
  END IF;

  SELECT d.content_hash INTO v_hash FROM public.embedding_document_for_entity(j.entity_type, j.entity_id) d;

  IF v_hash IS NULL THEN
    UPDATE public.embedding_jobs
       SET status = 'skipped', last_error = 'entity no longer exists or has no text to embed',
           lease_token = NULL, lease_expires_at = NULL, processed_at = now(), updated_at = now()
     WHERE id = j.id;
    RETURN 'skipped';
  END IF;

  IF v_hash <> j.content_hash THEN
    -- the record was edited while this job was running: do NOT store the old vector
    UPDATE public.embedding_jobs
       SET status = 'skipped', last_error = 'superseded: the record changed while embedding',
           lease_token = NULL, lease_expires_at = NULL, processed_at = now(), updated_at = now()
     WHERE id = j.id;
    INSERT INTO public.embedding_jobs (entity_type, entity_id, content_hash, status)
    VALUES (j.entity_type, j.entity_id, v_hash, 'pending')
    ON CONFLICT DO NOTHING;
    RETURN 'superseded';
  END IF;

  IF p_values IS NULL OR cardinality(p_values) <> j.dimensions THEN
    RAISE EXCEPTION 'embedding has % values, expected %', coalesce(cardinality(p_values), 0), j.dimensions;
  END IF;

  IF j.entity_type = 'apartment' THEN
    INSERT INTO public.listing_embeddings (listing_id, embedding, model, content_hash, updated_at)
    VALUES (j.entity_id, p_values, j.model, j.content_hash, now())
    ON CONFLICT (listing_id) DO UPDATE
      SET embedding = EXCLUDED.embedding, model = EXCLUDED.model,
          content_hash = EXCLUDED.content_hash, updated_at = now();
  ELSIF j.entity_type = 'event' THEN
    INSERT INTO public.event_embeddings (event_id, embedding, model, content_hash, updated_at)
    VALUES (j.entity_id, p_values, j.model, j.content_hash, now())
    ON CONFLICT (event_id) DO UPDATE
      SET embedding = EXCLUDED.embedding, model = EXCLUDED.model,
          content_hash = EXCLUDED.content_hash, updated_at = now();
  ELSIF j.entity_type = 'restaurant' THEN
    INSERT INTO public.restaurant_embeddings (restaurant_id, embedding, model, content_hash, updated_at)
    VALUES (j.entity_id, p_values, j.model, j.content_hash, now())
    ON CONFLICT (restaurant_id) DO UPDATE
      SET embedding = EXCLUDED.embedding, model = EXCLUDED.model,
          content_hash = EXCLUDED.content_hash, updated_at = now();
  ELSE
    RAISE EXCEPTION 'complete_embedding_job: unsupported entity type %', j.entity_type;
  END IF;

  UPDATE public.embedding_jobs
     SET status = 'done', last_error = NULL, lease_token = NULL, lease_expires_at = NULL,
         processed_at = now(), updated_at = now()
   WHERE id = j.id;
  RETURN 'done';
END
$fn$;

CREATE OR REPLACE FUNCTION public.fail_embedding_job(
  p_job_id uuid, p_lease_token uuid, p_reason text,
  p_retryable boolean DEFAULT true, p_skip boolean DEFAULT false, p_refund_attempt boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  j        public.embedding_jobs%ROWTYPE;
  v_reason text := left(regexp_replace(coalesce(p_reason, 'unknown error'), '\s+', ' ', 'g'), 300);
BEGIN
  SELECT * INTO j FROM public.embedding_jobs
   WHERE id = p_job_id AND lease_token = p_lease_token AND status = 'processing'
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'lost_lease';
  END IF;

  IF p_skip THEN
    UPDATE public.embedding_jobs
       SET status = 'skipped', last_error = v_reason, lease_token = NULL, lease_expires_at = NULL,
           processed_at = now(), updated_at = now()
     WHERE id = j.id;
    RETURN 'skipped';
  ELSIF p_refund_attempt THEN
    -- a configuration problem (for example a bad Gemini key), not this record's fault: give the attempt back
    UPDATE public.embedding_jobs
       SET status = 'pending', last_error = v_reason, lease_token = NULL, lease_expires_at = NULL,
           attempts = greatest(j.attempts - 1, 0), next_attempt_at = now() + interval '1 minute',
           updated_at = now()
     WHERE id = j.id;
    RETURN 'retry';
  ELSIF p_retryable AND j.attempts < 5 THEN
    UPDATE public.embedding_jobs
       SET status = 'pending', last_error = v_reason, lease_token = NULL, lease_expires_at = NULL,
           next_attempt_at = now() + least(interval '1 hour', interval '1 minute' * power(2, j.attempts)),
           updated_at = now()
     WHERE id = j.id;
    RETURN 'retry';
  ELSE
    UPDATE public.embedding_jobs
       SET status = 'failed', last_error = v_reason, lease_token = NULL, lease_expires_at = NULL,
           processed_at = now(), updated_at = now()
     WHERE id = j.id;
    RETURN 'failed';
  END IF;
END
$fn$;

-- service_role only. anon and authenticated must never claim, complete, fail or read documents.
REVOKE ALL ON FUNCTION public.embedding_document_for_entity(text, uuid)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_embedding_jobs(integer)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_embedding_job(uuid, uuid, double precision[])          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_embedding_job(uuid, uuid, text, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embedding_document_for_entity(text, uuid)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_embedding_jobs(integer)                                TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_embedding_job(uuid, uuid, double precision[])       TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_embedding_job(uuid, uuid, text, boolean, boolean, boolean) TO service_role;

-- 5 · one-time queue rebuild --------------------------------------------------------------------------------
-- The existing pending jobs carry the old md5(title||description||id) fingerprint, so none of them
-- matches a current document. Keep them as history, then queue exactly one current job per entity whose
-- stored vector (if any) does not match its document. ON CONFLICT is covered by the partial unique index.
UPDATE public.embedding_jobs
   SET status = 'skipped', last_error = 'superseded: queue rebuilt by SAN-1523 (new document fingerprint)',
       lease_token = NULL, lease_expires_at = NULL, updated_at = now()
 WHERE status = 'pending';

INSERT INTO public.embedding_jobs (entity_type, entity_id, content_hash, status)
SELECT 'apartment', a.id, d.content_hash, 'pending'
  FROM public.apartments a
 CROSS JOIN LATERAL public.embedding_document_for_entity('apartment', a.id) d
  LEFT JOIN public.listing_embeddings e ON e.listing_id = a.id
 WHERE e.content_hash IS DISTINCT FROM d.content_hash
ON CONFLICT DO NOTHING;

INSERT INTO public.embedding_jobs (entity_type, entity_id, content_hash, status)
SELECT 'event', v.id, d.content_hash, 'pending'
  FROM public.events v
 CROSS JOIN LATERAL public.embedding_document_for_entity('event', v.id) d
  LEFT JOIN public.event_embeddings e ON e.event_id = v.id
 WHERE e.content_hash IS DISTINCT FROM d.content_hash
ON CONFLICT DO NOTHING;

INSERT INTO public.embedding_jobs (entity_type, entity_id, content_hash, status)
SELECT 'restaurant', r.id, d.content_hash, 'pending'
  FROM public.restaurants r
 CROSS JOIN LATERAL public.embedding_document_for_entity('restaurant', r.id) d
  LEFT JOIN public.restaurant_embeddings e ON e.restaurant_id = r.id
 WHERE e.content_hash IS DISTINCT FROM d.content_hash
ON CONFLICT DO NOTHING;
