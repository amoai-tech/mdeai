-- SAN-984: one DB call consumes and audits together, with service-only access.
-- All records are fictional and rolled back before this test returns.
begin;
set local search_path = public, extensions;
select plan(21);

select is(has_function_privilege('anon', 'public.ticket_validate_consume_audited(uuid,text,uuid,text,inet)','EXECUTE'), false,
  'anonymous callers cannot consume or audit a QR');
select is(has_function_privilege('authenticated', 'public.ticket_validate_consume_audited(uuid,text,uuid,text,inet)','EXECUTE'), false,
  'ordinary signed-in buyers cannot invoke privileged scan');
select is(has_function_privilege('service_role', 'public.ticket_validate_consume_audited(uuid,text,uuid,text,inet)','EXECUTE'), true,
  'server service client can run the atomic scanner');

create temp table san984_fixture(event_id uuid, alternate_event uuid, actor uuid, ticket_id uuid, order_id uuid);
do $fixture$
declare
  v_event uuid;
  v_other uuid;
  v_ticket uuid;
  v_order uuid;
  v_actor uuid;
begin
  -- CI begins with zero auth users. Create our own test actor; ROLLBACK
  -- removes the actor and any profile rows produced by auth triggers.
  insert into auth.users(id, email, aud, role)
  values (gen_random_uuid(), 'san984-qa-actor@example.invalid',
          'authenticated', 'authenticated')
  returning id into v_actor;
  insert into public.events(name,event_start_time,event_end_time,status,is_active)
  values ('SAN-984 local atomic scan fixture',now()+interval '1 day',now()+interval '2 days','draft',true)
  returning id into v_event;
  insert into public.events(name,event_start_time,event_end_time,status,is_active)
  values ('SAN-984 wrong-event fixture',now()+interval '1 day',now()+interval '2 days','draft',true)
  returning id into v_other;
  insert into public.event_tickets(event_id,name,price_cents,qty_total)
  values(v_event,'QA only',500,10) returning id into v_ticket;
  insert into public.event_orders(event_id,ticket_id,quantity,total_cents,short_id,buyer_name,buyer_email,access_token,status)
  values(v_event,v_ticket,2,1000,'QA984001','QA attendee','scan-test@example.test','qa-token-984','paid')
  returning id into v_order;
  insert into public.event_attendees(id,event_id,ticket_id,order_id,qr_token,full_name,email,status)
  values
    (gen_random_uuid(),v_event,v_ticket,v_order,'san984-qr-one','QA visitor one','one@example.test','active'),
    (gen_random_uuid(),v_event,v_ticket,v_order,'san984-qr-two','QA visitor two','two@example.test','active');
  insert into san984_fixture values(v_event,v_other,v_actor,v_ticket,v_order);
end;
$fixture$;

select is((select public.ticket_validate_consume_audited(event_id,'san984-qr-one',actor,'QA scanner',null)->>'result' from san984_fixture),
  'consumed','first scan consumes the correct paid ticket');
select is((select qr_used_at is not null from public.event_attendees where qr_token='san984-qr-one'),
  true,'accepted ticket has a persisted QR use timestamp');
select is((select count(*)::int from public.event_check_ins where qr_token='san984-qr-one' and result='consumed'),
  1,'accepted ticket and successful audit persist together');
select is((select public.ticket_validate_consume_audited(event_id,'san984-qr-one',actor,'QA scanner',null)->>'result' from san984_fixture),
  'already_used','retry cannot consume the same QR twice');
select is((select count(*)::int from public.event_check_ins where qr_token='san984-qr-one'),
  2,'retry has a second audit but no duplicate consumption');
select is((select public.ticket_validate_consume_audited(event_id,'san984-unknown-qr',actor,'QA scanner',null)->>'result' from san984_fixture),
  'unknown_token','unknown QR rejected without consuming a ticket');
select is((select attendee_id is null from public.event_check_ins where qr_token='san984-unknown-qr'),
  true,'unknown QR audit does not invent attendee identity');
select throws_ok(
  $$select public.ticket_validate_consume_audited(
    (select event_id from san984_fixture),'san984-qr-two',gen_random_uuid(),'QA scanner',null)$$,
  '23503',null,'audit failure aborts the atomic scan');
select is((select qr_used_at is null from public.event_attendees where qr_token='san984-qr-two'),
  true,'audit failure rolls back QR consumption');

-- The saved order is authoritative even if an attendee remains incorrectly active
-- after a pending/refunded/cancelled transition (webhook/recovery races).
update public.event_orders set status='refunded' where id=(select order_id from san984_fixture);
select is((select public.ticket_validate_consume_audited(event_id,'san984-qr-two',actor,'QA scanner',null)->>'result' from san984_fixture),
  'refunded','fully refunded order rejects a stale active attendee');
update public.event_orders set status='cancelled' where id=(select order_id from san984_fixture);
select is((select public.ticket_validate_consume_audited(event_id,'san984-qr-two',actor,'QA scanner',null)->>'result' from san984_fixture),
  'cancelled','cancelled order rejects a stale active attendee');
update public.event_orders set status='pending' where id=(select order_id from san984_fixture);
select is((select public.ticket_validate_consume_audited(event_id,'san984-qr-two',actor,'QA scanner',null)->>'result' from san984_fixture),
  'pending_payment','unpaid order rejects a stale active attendee');
select is((select qr_used_at is null from public.event_attendees where qr_token='san984-qr-two'),
  true,'no invalid payment state ever consumes the second ticket');
update public.event_orders set status='paid' where id=(select order_id from san984_fixture);
update public.event_attendees set status='refunded' where qr_token='san984-qr-two';
select is((select public.ticket_validate_consume_audited(event_id,'san984-qr-two',actor,'QA scanner',null)->>'result' from san984_fixture),
  'refunded','refunded attendee is not admitted even if order remains paid');
update public.event_attendees set status='cancelled' where qr_token='san984-qr-two';
select is((select public.ticket_validate_consume_audited(event_id,'san984-qr-two',actor,'QA scanner',null)->>'result' from san984_fixture),
  'cancelled','cancelled attendee is not admitted even if order remains paid');
update public.event_attendees set status='pending' where qr_token='san984-qr-two';
select is((select public.ticket_validate_consume_audited(event_id,'san984-qr-two',actor,'QA scanner',null)->>'result' from san984_fixture),
  'pending_payment','unpaid attendee is not admitted even if order remains paid');
update public.event_attendees set status='active' where qr_token='san984-qr-two';
select is((select public.ticket_validate_consume_audited(alternate_event,'san984-qr-two',actor,'QA scanner',null)->>'result' from san984_fixture),
  'wrong_event','cross-event QR is rejected without admitting attendee');
select is((select qr_used_at is null from public.event_attendees where qr_token='san984-qr-two'),
  true,'wrong-event scan still does not consume the ticket');

select * from finish();
rollback;
