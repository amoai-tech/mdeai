-- SAN-1523 (PR 2) — run the embedding worker automatically, once a minute, only when there is work
--
-- WHY
-- The worker Edge Function `process-embedding-jobs` and the queue (`public.embedding_jobs`) exist, but
-- nothing calls the worker. On production 148 jobs sit pending, and only 8 of 42 active apartments are in
-- the AI search index, so a renter asking for "1BR in Laureles under COP 3,000,000/month" sees 1 of the 3
-- apartments that match. Editing a listing queues a job that never runs.
--
-- WHAT
-- One pg_cron job, `mdeai_embedding_jobs_tick`, every minute. It follows the pattern SAN-1313 set for
-- `mdeai_lead_reminder_tick`: the project URL and the shared secret come from Vault at run time, so no host
-- or secret is written into Git and a replayed dev/recovery database can never call production.
--
-- It does two things the lead-reminder job does not need to:
--   * It skips the HTTP call when no job is claimable (same rule as claim_embedding_jobs: pending and due,
--     or processing with an expired lease). An idle queue costs one cheap SELECT per minute, not a function
--     invocation.
--   * It allows 30 s for the response. The worker embeds up to 5 documents per call; pg_net's 5 s default
--     would record a timeout while the worker was still finishing.
--
-- ONE-TIME SETUP (not in Git, because it is a secret)
-- Vault must contain `embedding_cron_secret`, equal to the Edge Function secret EMBEDDING_CRON_SECRET, and
-- `project_url` (already present). Until `embedding_cron_secret` exists the job raises P1523 on each tick
-- when there is work, so a missing secret fails loudly in cron.job_run_details instead of silently.
--
-- HOW TO READ THE RESULT
-- pg_cron reports `succeeded` once net.http_post has QUEUED the request. The worker's real answer
-- (200 / 401 / 502 / 503) is in net._http_response. Check both.
--
-- pg_net IS DECLARED HERE, DELIBERATELY
-- The baseline (20260404044720_remote_schema.sql) drops pg_net, and production has it enabled by hand
-- (0.19.5), so a database rebuilt from Git had no net.http_post and any HTTP schedule would fail on first
-- run. `create extension if not exists` is a no-op where it is already installed (production).
--
-- IDEMPOTENT: cron.schedule() with an existing name updates that job, so re-running cannot duplicate it.
-- No table, policy, grant or function is changed.

create extension if not exists pg_net;

select cron.schedule(
  'mdeai_embedding_jobs_tick',
  '* * * * *',
  $cron$
    do $guard$
    declare
      v_project_url text;
      v_cron_secret text;
    begin
      -- Nothing claimable: do not wake the Edge Function.
      if not exists (
        select 1
        from public.embedding_jobs j
        where (j.status = 'pending' and j.next_attempt_at <= now())
           or (j.status = 'processing' and j.lease_expires_at < now())
      ) then
        return;
      end if;

      select decrypted_secret into v_project_url
      from vault.decrypted_secrets
      where name = 'project_url';

      if v_project_url is null or btrim(v_project_url) = '' then
        raise exception
          'SAN-1523: Vault secret "project_url" is missing or empty. Refusing to guess a target host.'
          using errcode = 'P1523';
      end if;

      select decrypted_secret into v_cron_secret
      from vault.decrypted_secrets
      where name = 'embedding_cron_secret';

      if v_cron_secret is null or btrim(v_cron_secret) = '' then
        raise exception
          'SAN-1523: Vault secret "embedding_cron_secret" is missing or empty. Provision it before the embedding schedule can run.'
          using errcode = 'P1523';
      end if;

      perform net.http_post(
        url                  := rtrim(v_project_url, '/') || '/functions/v1/process-embedding-jobs',
        headers              := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', v_cron_secret
        ),
        body                 := '{"limit":5}'::jsonb,
        timeout_milliseconds := 30000
      );
    end
    $guard$;
  $cron$
);
