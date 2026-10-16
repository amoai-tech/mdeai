-- SAN-1502: internal development discovery is not a public-launch eligibility check.
-- Published customer eligibility and private-user access remain separate.
begin;
select plan(5);

select is(
  public.rental_test_listing_is_available('active','pending','draft','{"is_test_fixture":true}'::jsonb),
  true,
  'active development apartment remains visible without moderation/publish approval'
);
select is(
  public.rental_test_listing_is_available('active','approved','published',
    '{"is_test_fixture":true,"admin_test_photo_rights":"revoked","admin_test_publish_state":"revoked"}'::jsonb),
  true,
  'photo and publication paperwork do not remove the apartment from development discovery'
);
select is(
  public.rental_test_listing_is_available('inactive','approved','published','{"is_test_fixture":true}'::jsonb),
  false,
  'inactive remains a deliberate operator visibility toggle'
);
select is(
  public.rental_test_listing_is_available('active','approved','published','{}'::jsonb),
  false,
  'normal public apartment is not reclassified as development fixture'
);
select is(
  public.rental_listing_is_public('active','approved','published',
     '11111111-1111-4111-8111-111111111111'::uuid,'{"is_test_fixture":true}'::jsonb),
  false,
  'development fixture is not accidentally public even if approved and published'
);

select * from finish();
rollback;
