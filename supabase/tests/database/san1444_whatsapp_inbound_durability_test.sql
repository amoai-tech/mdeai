-- SAN-1444 · durable WhatsApp inbound — PostgreSQL behavior, ownership and permissions
--
-- Runs in one transaction and rolls back. Deterministic single-session proof of: idempotent
-- recording, claim ownership, stale (fenced) completion/failure, lease reclaim after a crash,
-- bounded retries with dead-letter, and RPC privileges.
--
-- True simultaneous SKIP LOCKED contention needs two connections; see the concurrency script
-- in docs/audits/san-1444-durable-inbound.md.

begin;
select plan(23);

-- A · structure and permissions
select has_column('public', 'whatsapp_messages', 'processing_status', 'processing_status column exists');
select has_column('public', 'whatsapp_messages', 'claim_token', 'claim_token (fencing) column exists');
select has_column('public', 'whatsapp_messages', 'next_attempt_at', 'next_attempt_at column exists');
select has_function('public', 'whatsapp_record_inbound', array['text','text','text','text','jsonb'], 'record RPC exists');
select has_function('public', 'whatsapp_claim_inbound', array['text','integer','integer','integer'], 'claim RPC exists');
select has_function('public', 'whatsapp_dead_letter_inbound', array['integer','integer'], 'dead-letter RPC exists');
select has_function('public', 'whatsapp_complete_inbound', array['uuid','uuid'], 'complete RPC exists');
select has_function('public', 'whatsapp_fail_inbound', array['uuid','uuid','text','integer','integer'], 'fail RPC exists');
select ok(has_function_privilege('service_role', 'public.whatsapp_claim_inbound(text,integer,integer,integer)', 'execute'), 'service_role may claim');
select ok(not has_function_privilege('anon', 'public.whatsapp_claim_inbound(text,integer,integer,integer)', 'execute'), 'anon may NOT claim');
select ok(not has_function_privilege('authenticated', 'public.whatsapp_complete_inbound(uuid,uuid)', 'execute'), 'authenticated may NOT complete');

-- B · ten identical deliveries store exactly one row
do $$
begin
  for i in 1..10 loop
    perform public.whatsapp_record_inbound('t-dup', '57300', 'text', 'hola', '{}'::jsonb);
  end loop;
end $$;
select is((select count(*)::int from public.whatsapp_messages where external_id = 't-dup'), 1, 'ten identical deliveries store ONE inbound row');
select is((select is_new from public.whatsapp_record_inbound('t-dup', '57300', 'text', 'hola', '{}'::jsonb)), false, 'a duplicate reports is_new = false');

-- C · claim ownership and stale-worker fencing
select id as c1_id, claim_token as c1_token
  from public.whatsapp_claim_inbound('worker-a', 10, 180, 5)
 where external_id = 't-dup'
\gset
select is((select processing_status from public.whatsapp_messages where external_id = 't-dup'), 'processing', 'the claim moved the row to processing');
select is(public.whatsapp_complete_inbound(:'c1_id'::uuid, gen_random_uuid()), 0, 'a wrong token cannot complete the row');
update public.whatsapp_messages set claimed_at = now() - interval '1 hour' where external_id = 't-dup';
select id as c2_id, claim_token as c2_token
  from public.whatsapp_claim_inbound('worker-b', 10, 180, 5)
 where external_id = 't-dup'
\gset
select is((select claimed_by from public.whatsapp_messages where external_id = 't-dup'), 'worker-b', 'an expired lease is safely reclaimed by a new worker');
select is(public.whatsapp_complete_inbound(:'c1_id'::uuid, :'c1_token'::uuid), 0, 'the stale worker cannot complete the new claim');
select is(public.whatsapp_fail_inbound(:'c1_id'::uuid, :'c1_token'::uuid, 'late', 5, 30), 0, 'the stale worker cannot fail the new claim');
select is(public.whatsapp_complete_inbound(:'c2_id'::uuid, :'c2_token'::uuid), 1, 'the current owner completes exactly one row');

-- D · crash recovery, bounded retries and dead-letter
insert into public.whatsapp_messages
  (phone_number, direction, content, sender, external_id, processing_status, attempts, next_attempt_at)
values
  ('57300', 'inbound', 'crashed', 'user', 't-crash', 'processing', 1, now()),
  ('57300', 'inbound', 'exhausted', 'user', 't-dead', 'failed', 5, now());
update public.whatsapp_messages set claimed_at = now() - interval '1 hour' where external_id = 't-crash';
select is((select count(*)::int from public.whatsapp_claim_inbound('worker-c', 10, 180, 5) where external_id = 't-crash'), 1, 'work left by a crashed worker is reclaimable');
select ok(public.whatsapp_dead_letter_inbound(5, 180) >= 1, 'exhausted work is dead-lettered');
select is((select processing_status from public.whatsapp_messages where external_id = 't-dead'), 'dead', 'the exhausted row is terminal');
select is((select count(*)::int from public.whatsapp_claim_inbound('worker-d', 10, 180, 5) where external_id = 't-dead'), 0, 'the exhausted row is not reclaimable');

select * from finish();
rollback;
