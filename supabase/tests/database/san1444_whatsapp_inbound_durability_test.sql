begin;
select plan(7);

select has_column('public', 'whatsapp_messages', 'processing_status', 'processing_status column exists');
select has_column('public', 'whatsapp_messages', 'claim_token', 'claim_token (fencing) column exists');
select has_column('public', 'whatsapp_messages', 'next_attempt_at', 'next_attempt_at column exists');
select has_function('public', 'whatsapp_record_inbound', array['text','text','text','text','jsonb'], 'record RPC exists');
select has_function('public', 'whatsapp_claim_inbound', array['text','integer','integer','integer'], 'claim RPC exists');
select ok(
  not has_function_privilege('anon', 'public.whatsapp_claim_inbound(text,integer,integer,integer)', 'execute'),
  'anon cannot execute the claim RPC'
);
select ok(
  has_function_privilege('service_role', 'public.whatsapp_claim_inbound(text,integer,integer,integer)', 'execute'),
  'service_role can execute the claim RPC'
);

select * from finish();
rollback;
