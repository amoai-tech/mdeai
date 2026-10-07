-- SAN-1433 — coordinate and essential-data proof.
--
-- Asserts the migration wrote exactly the 8 approved pins with a consistent PostGIS
-- location, left the 2 held candidates unmapped, added only the Alizares
-- availability date, and did not promote any candidate.
--
-- Run with: supabase test db
begin;

select plan(32);

-- ── 8 approved coordinate pairs (latitude) ───────────────────────────────────
select is((select latitude from public.apartments where slug='candidate-rentberry-119391131'), 6.2188538::numeric, 'Alizares latitude');
select is((select latitude from public.apartments where slug='candidate-rentberry-119390518'), 6.1884708::numeric, 'Torres del Arroyo latitude');
select is((select latitude from public.apartments where slug='candidate-rentberry-119839712'), 6.1864096::numeric, 'Cantero latitude');
select is((select latitude from public.apartments where slug='candidate-rentberry-119839707'), 6.2220797::numeric, 'Plaza del Rio latitude');
select is((select latitude from public.apartments where slug='candidate-rentberry-119840596'), 6.1901416::numeric, 'Cioccolato latitude');
select is((select latitude from public.apartments where slug='candidate-rentberry-119388617'), 6.2140535::numeric, 'Castropol latitude');
select is((select latitude from public.apartments where slug='candidate-rentberry-118796331'), 6.2401220::numeric, 'Laureles Carrera 78 latitude');
select is((select latitude from public.apartments where slug='candidate-rentberry-telaviv-1204'), 6.2462923::numeric, 'Telaviv latitude');

-- ── 8 approved coordinate pairs (longitude, compared to the approved value) ──
select is((select longitude from public.apartments where slug='candidate-rentberry-119391131'), -75.6034118::numeric, 'Alizares longitude');
select is((select longitude from public.apartments where slug='candidate-rentberry-119390518'), -75.5624821::numeric, 'Torres del Arroyo longitude');
select is((select longitude from public.apartments where slug='candidate-rentberry-119839712'), -75.5686795::numeric, 'Cantero longitude');
select is((select longitude from public.apartments where slug='candidate-rentberry-119839707'), -75.5735020::numeric, 'Plaza del Rio longitude');
select is((select longitude from public.apartments where slug='candidate-rentberry-119840596'), -75.5726974::numeric, 'Cioccolato longitude');
select is((select longitude from public.apartments where slug='candidate-rentberry-119388617'), -75.5678635::numeric, 'Castropol longitude');
select is((select longitude from public.apartments where slug='candidate-rentberry-118796331'), -75.5983370::numeric, 'Laureles Carrera 78 longitude');
select is((select longitude from public.apartments where slug='candidate-rentberry-telaviv-1204'), -75.5984332::numeric, 'Telaviv longitude');

-- ── PostGIS location derived and consistent ──────────────────────────────────
select ok((select location is not null
                  and abs(st_x(location::geometry) - longitude) < 0.000001
                  and abs(st_y(location::geometry) - latitude) < 0.000001
             from public.apartments where slug='candidate-rentberry-119391131'), 'Alizares PostGIS consistent');
select ok((select location is not null
                  and abs(st_x(location::geometry) - longitude) < 0.000001
                  and abs(st_y(location::geometry) - latitude) < 0.000001
             from public.apartments where slug='candidate-rentberry-119390518'), 'Torres del Arroyo PostGIS consistent');
select ok((select location is not null
                  and abs(st_x(location::geometry) - longitude) < 0.000001
                  and abs(st_y(location::geometry) - latitude) < 0.000001
             from public.apartments where slug='candidate-rentberry-119839712'), 'Cantero PostGIS consistent');
select ok((select location is not null
                  and abs(st_x(location::geometry) - longitude) < 0.000001
                  and abs(st_y(location::geometry) - latitude) < 0.000001
             from public.apartments where slug='candidate-rentberry-119839707'), 'Plaza del Rio PostGIS consistent');
select ok((select location is not null
                  and abs(st_x(location::geometry) - longitude) < 0.000001
                  and abs(st_y(location::geometry) - latitude) < 0.000001
             from public.apartments where slug='candidate-rentberry-119840596'), 'Cioccolato PostGIS consistent');
select ok((select location is not null
                  and abs(st_x(location::geometry) - longitude) < 0.000001
                  and abs(st_y(location::geometry) - latitude) < 0.000001
             from public.apartments where slug='candidate-rentberry-119388617'), 'Castropol PostGIS consistent');
select ok((select location is not null
                  and abs(st_x(location::geometry) - longitude) < 0.000001
                  and abs(st_y(location::geometry) - latitude) < 0.000001
             from public.apartments where slug='candidate-rentberry-118796331'), 'Laureles Carrera 78 PostGIS consistent');
select ok((select location is not null
                  and abs(st_x(location::geometry) - longitude) < 0.000001
                  and abs(st_y(location::geometry) - latitude) < 0.000001
             from public.apartments where slug='candidate-rentberry-telaviv-1204'), 'Telaviv PostGIS consistent');

-- ── Held candidates stay unmapped ────────────────────────────────────────────
select ok((select latitude is null and longitude is null and location is null
             from public.apartments where slug='candidate-rentberry-119839663'), 'Pie de Cuesta remains unmapped');
select ok((select latitude is null and longitude is null and location is null
             from public.apartments where slug='candidate-rentberry-el-laurel-201'), 'El Laurel remains unmapped');

-- ── Coordinate status evidence ───────────────────────────────────────────────
select is((select count(*)::int from public.apartments
            where slug in ('candidate-rentberry-119391131','candidate-rentberry-119390518',
                           'candidate-rentberry-119839712','candidate-rentberry-119839707',
                           'candidate-rentberry-119840596','candidate-rentberry-119388617',
                           'candidate-rentberry-118796331','candidate-rentberry-telaviv-1204')
              and metadata->>'coordinates_status' = 'provided_unverified'
              and metadata->'coordinate_evidence' is not null), 8, '8 candidates carry provided_unverified coordinate evidence (receipt pending)');
select is((select count(*)::int from public.apartments
            where slug in ('candidate-rentberry-119839663','candidate-rentberry-el-laurel-201')
              and metadata->>'coordinates_status' = 'missing'), 2, 'held candidates keep coordinates_status=missing');

-- ── Availability added only for Alizares ─────────────────────────────────────
select is((select available_from from public.apartments where slug='candidate-rentberry-119391131'),
  date '2026-10-06', 'Alizares available_from is the confirmed date');
select is((select count(*)::int from public.apartments
            where slug like 'candidate-rentberry-%' and available_from is not null), 1,
  'no other candidate gained an availability date');

-- ── No promotion / no verification side effects ──────────────────────────────
select is((select count(*)::int from public.apartments
            where slug like 'candidate-rentberry-%'
              and (status <> 'inactive' or moderation_status <> 'pending'
                   or listing_workflow_status <> 'draft' or coalesce(verified, false))), 0,
  'no candidate became active/approved/published/verified');
select is((select count(*)::int from public.property_verifications pv
             join public.apartments a on a.id = pv.apartment_id
            where a.slug like 'candidate-rentberry-%' and pv.status <> 'pending'), 0,
  'no candidate property verification was promoted');

select * from finish();
rollback;
