-- Direct RPC authorization regression for three diagnosed SECURITY DEFINER functions.
-- All tests are read-only; transaction rolls back. Preserve intended guest APIs.
begin;
select plan(16);

select is(has_function_privilege('anon',
  'public.fn_record_conversion(uuid,text,text,integer,uuid,jsonb)','EXECUTE'),
  false,'guest cannot forge arbitrary marketing conversion');
select is(has_function_privilege('authenticated',
  'public.fn_record_conversion(uuid,text,text,integer,uuid,jsonb)','EXECUTE'),
  false,'customer cannot forge another user conversion');
select ok(has_function_privilege('service_role',
  'public.fn_record_conversion(uuid,text,text,integer,uuid,jsonb)','EXECUTE'),
  'server-side attribution remains available');

select is(has_function_privilege('anon','public.is_suppressed(text,text)','EXECUTE'),
  false,'guest cannot enumerate suppressed email and phone identifiers');
select is(has_function_privilege('authenticated','public.is_suppressed(text,text)','EXECUTE'),
  false,'signed-in user cannot enumerate suppression members');
select ok(has_function_privilege('service_role','public.is_suppressed(text,text)','EXECUTE'),
  'server outbox logic retains lookup');

select is(has_function_privilege('anon','public.decide_approval(uuid,text,text)','EXECUTE'),
  false,'guest cannot invoke admin decision RPC');
select ok(has_function_privilege('authenticated','public.decide_approval(uuid,text,text)','EXECUTE'),
  'signed-in administrators retain direct decision path');
select ok(has_function_privilege('service_role','public.decide_approval(uuid,text,text)','EXECUTE'),
  'service callers retain admin action');

select ok(has_function_privilege('anon','public.get_anonymous_order(uuid,text)','EXECUTE'),
  'token-protected guest ticket lookup remains public');
select ok(has_function_privilege('anon','public.get_landlord_public_profile(uuid)','EXECUTE'),
  'public landlord profile reads remain possible');
select ok(has_function_privilege('anon','public.log_outbound_click(uuid,text,text,text)','EXECUTE'),
  'existing public outbound click path stays available');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='fn_outbox_suppression_check'),
 'suppression trigger retains its SECURITY DEFINER context');

-- Verify the effective direct-RPC boundary, not only pg_proc ACL metadata.
-- Each attempted call must fail with insufficient_privilege before entering
-- the SECURITY DEFINER body, so it cannot write data.
set local role anon;
select throws_ok(
  $$select public.fn_record_conversion(null::uuid,'event','purchase',null::integer,null::uuid,'{}'::jsonb)$$,
  '42501', null, 'anon invocation cannot forge a conversion');
select throws_ok(
  $$select public.decide_approval(null::uuid,'approved',null::text)$$,
  '42501', null, 'anon invocation cannot enter approval RPC');
reset role;
set local role authenticated;
select throws_ok(
  $$select public.is_suppressed('email','qa@example.invalid')$$,
  '42501', null, 'authenticated caller cannot query private suppression list');
reset role;

select * from finish();
rollback;
