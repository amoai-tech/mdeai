-- SAN-1444 · outbound send + delivery status persistence (PR 1)
--
-- Proves the transactional send+complete RPC, the monotonic delivery status, the early-receipt
-- enrichment path, fencing, and the service_role-only execution boundary.

begin;
select plan(25);

-- A · structure and permissions
select has_column('public', 'whatsapp_messages', 'inbound_message_id', 'inbound_message_id column exists');
select has_column('public', 'whatsapp_messages', 'delivery_status_at', 'delivery_status_at column exists');
select has_function('public', 'whatsapp_complete_inbound_with_sends', array['uuid','uuid','jsonb'], 'send+complete RPC exists');
select has_function('public', 'whatsapp_record_delivery_status', array['text','text','timestamptz','text'], 'delivery status RPC exists');
select has_function('public', 'whatsapp_status_rank', array['text'], 'status rank helper exists');
select ok(not has_function_privilege('anon', 'public.whatsapp_complete_inbound_with_sends(uuid,uuid,jsonb)', 'execute'), 'anon may NOT complete with sends');
select ok(not has_function_privilege('authenticated', 'public.whatsapp_record_delivery_status(text,text,timestamptz,text)', 'execute'), 'authenticated may NOT record delivery status');
select ok(has_function_privilege('service_role', 'public.whatsapp_complete_inbound_with_sends(uuid,uuid,jsonb)', 'execute'), 'service_role may complete with sends');

-- B · delivery status is monotonic and idempotent
select is(public.whatsapp_record_delivery_status('t-deliv', 'sent', now(), null), 1, 'sent recorded');
select is(public.whatsapp_record_delivery_status('t-deliv', 'delivered', now(), null), 1, 'delivered recorded');
select is(public.whatsapp_record_delivery_status('t-deliv', 'sent', now(), null), 1, 'a late sent callback is accepted without error');
select is((select status from public.whatsapp_messages where external_id = 't-deliv'), 'delivered', 'status did NOT regress to sent');
select is(public.whatsapp_record_delivery_status('t-deliv', 'read', now(), null), 1, 'read recorded');
select is((select status from public.whatsapp_messages where external_id = 't-deliv'), 'read', 'status advanced to read');
select is(public.whatsapp_record_delivery_status('t-deliv', 'read', now(), null), 1, 'a duplicate read callback is safe');
select is((select count(*)::int from public.whatsapp_messages where external_id = 't-deliv'), 1, 'exactly one row per wamid');

-- C · an early receipt is enriched, not lost, by the send+complete transaction
insert into public.whatsapp_messages
  (phone_number, direction, message_type, content, sender, external_id, status, processing_status, attempts, claimed_at, claimed_by, claim_token, next_attempt_at)
values
  ('573001112233', 'inbound', 'text', 'find me a 2br', 'user', 't-in-1', 'pending', 'processing', 1, now(), 'w1', '22222222-2222-2222-2222-222222222222', now())
returning id as inb
\gset
select is(public.whatsapp_record_delivery_status('t-early', 'delivered', '2026-01-01T10:03:00Z'::timestamptz, null), 1, 'early receipt (before the send) is buffered');
select is(public.whatsapp_complete_inbound_with_sends(:'inb', '22222222-2222-2222-2222-222222222222', '[{"wamid":"t-early","content":"here are listings"},{"wamid":"t-new","content":"more"}]'::jsonb), 2, 'both confirmed sends are recorded');
select is((select processing_status from public.whatsapp_messages where id = :'inb'), 'processed', 'the inbound row is completed in the same transaction');
select is((select count(*)::int from public.whatsapp_messages where inbound_message_id = :'inb'), 2, 'both outbound rows link to the inbound message');
select is((select status from public.whatsapp_messages where external_id = 't-early'), 'delivered', 'the early receipt status is preserved');
select is((select content from public.whatsapp_messages where external_id = 't-early'), 'here are listings', 'the placeholder is enriched with the reply content');
select is((select delivery_status_at from public.whatsapp_messages where external_id = 't-early'), '2026-01-01T10:03:00Z'::timestamptz, 'enrichment preserves the ORIGINAL Meta delivery timestamp');
select is(public.whatsapp_complete_inbound_with_sends(:'inb', gen_random_uuid(), '[{"wamid":"t-x","content":"x"}]'::jsonb), 0, 'a stale/wrong claim token records nothing');
select is((select count(*)::int from public.whatsapp_messages where external_id = 't-x'), 0, 'a fenced call inserts no outbound row');

select * from finish();
rollback;
