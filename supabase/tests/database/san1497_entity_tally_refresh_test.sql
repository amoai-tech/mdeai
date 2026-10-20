-- SAN-1497 · vote.entity_tally follows reviews and deletions, not just inserts
begin;
select plan(5);

insert into auth.users (id, email) values
  ('f1498000-0000-0000-0000-000000000001','refresh-a@example.com'),
  ('f1498000-0000-0000-0000-000000000002','refresh-b@example.com');
insert into public.restaurants (id, name, is_active) values
  ('a1498000-0000-0000-0000-000000000001','[TEST] Refresh Restaurant', true);
insert into vote.contests (id, slug, kind, title, org_id, starts_at, ends_at, status) values
  ('c1498000-0000-0000-0000-000000000001','refresh-test','restaurant','[TEST] Refresh','f1498000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '1 day','live');
insert into vote.entities (id, contest_id, slug, display_name, restaurant_id) values
  ('e1498000-0000-0000-0000-000000000001','c1498000-0000-0000-0000-000000000001','refresh-e','[TEST] Refresh E','a1498000-0000-0000-0000-000000000001');

insert into vote.votes (id, contest_id, entity_id, voter_user_id, source, ip_hash, idempotency_key, restaurant_ballot, fraud_status, development_test) values
  ('d1498000-0000-0000-0000-000000000001','c1498000-0000-0000-0000-000000000001','e1498000-0000-0000-0000-000000000001','f1498000-0000-0000-0000-000000000001','audience','iph','rf-1',true,'pending',false);

select is((select audience_votes from vote.entity_tally where entity_id = 'e1498000-0000-0000-0000-000000000001'),
  1::bigint, 'an inserted ballot is projected');

update vote.votes set fraud_status = 'blocked' where id = 'd1498000-0000-0000-0000-000000000001';

select is((select audience_votes from vote.entity_tally where entity_id = 'e1498000-0000-0000-0000-000000000001'),
  0::bigint, 'flagging a ballot blocked refreshes the projection');

update vote.votes set fraud_status = 'clean' where id = 'd1498000-0000-0000-0000-000000000001';

select is((select audience_votes from vote.entity_tally where entity_id = 'e1498000-0000-0000-0000-000000000001'),
  1::bigint, 'reviewing a ballot clean refreshes the projection');

delete from vote.votes where id = 'd1498000-0000-0000-0000-000000000001';

select is((select audience_votes from vote.entity_tally where entity_id = 'e1498000-0000-0000-0000-000000000001'),
  0::bigint, 'deleting a ballot refreshes the projection');

select is((select position('DELETE' in pg_get_triggerdef((select oid from pg_trigger where tgname = 'tr_recompute_tally_on_vote'))) > 0),
  true, 'the recompute trigger covers more than INSERT');

select * from finish();
rollback;
