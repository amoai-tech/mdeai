-- SAN-1444 — recurring recovery for durable inbound WhatsApp processing.
--
-- The sweeper endpoint retries pending, failed and lease-expired inbound messages when no new
-- traffic arrives. This reuses the project's existing pg_cron + pg_net pattern (SAN-1313) rather
-- than adding another background service. The app URL and shared secret come from Vault; a
-- missing secret raises instead of posting to a guessed host.
select cron.schedule(
  'whatsapp_inbound_recovery',
  '*/2 * * * *',
  $cron$
  do $$
  declare
    v_app_url text;
    v_secret text;
  begin
    select decrypted_secret into v_app_url from vault.decrypted_secrets where name = 'mde_app_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'whatsapp_process_secret';
    if v_app_url is null or btrim(v_app_url) = '' then
      raise exception 'SAN-1444: Vault secret "mde_app_url" is missing or empty. Provision it before this schedule can run.';
    end if;
    if v_secret is null or btrim(v_secret) = '' then
      raise exception 'SAN-1444: Vault secret "whatsapp_process_secret" is missing or empty. Provision it before this schedule can run.';
    end if;
    perform net.http_post(
      url := rtrim(v_app_url, '/') || '/api/whatsapp/process-inbound',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-whatsapp-process-secret', v_secret
      ),
      body := '{}'::jsonb
    );
  end $$;
  $cron$
);
