-- SAN-1503: safe read-only batch verification. Never inserts/updates/deletes.
SELECT count(*) AS imported,
       count(DISTINCT a.source_listing_id) AS unique_import_keys,
       count(*) FILTER (WHERE a.status='active') AS active,
       count(*) FILTER (WHERE public.rental_listing_is_public(
         a.status,a.moderation_status,a.listing_workflow_status,a.landlord_id,a.metadata
       )) AS discoverable,
       count(*) FILTER (WHERE a.rental_can_request_viewing) AS viewing_eligible,
       count(*) FILTER (WHERE a.verified IS FALSE) AS honestly_unverified,
       count(*) FILTER (WHERE a.latitude IS NOT NULL AND a.longitude IS NOT NULL) AS pins,
       sum(cardinality(a.images)) AS photo_urls
FROM public.apartments a WHERE a.source_listing_id LIKE 'san1503:%';

SELECT count(*) gallery_rows
FROM public.rental_listing_images i JOIN public.apartments a ON a.id=i.listing_id
WHERE a.source_listing_id LIKE 'san1503:%';

SELECT count(*) stored_photos FROM storage.objects
WHERE bucket_id='listing-photos' AND name LIKE '%/san1503/%';

SELECT phase FROM public.rental_runtime_settings WHERE singleton;
