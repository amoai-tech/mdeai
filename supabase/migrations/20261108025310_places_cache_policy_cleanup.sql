-- SAN-776: remove all Places payloads retained under the old 7-day cache.
-- The detail path no longer reads or writes these rows; only Place IDs are exempt
-- from Google's caching restrictions. Delete every row, including recent rows the
-- old code may write between migration and deploy. Reviewed cleanup for SAN-105.
DELETE FROM public.place_details_cache;
DELETE FROM public.places_search_cache;
