-- SAN-776: remove expired Places payloads retained under the old 7-day cache.
-- The detail path no longer reads or writes these rows; only Place IDs are exempt
-- from Google's caching restrictions. Reviewed cleanup for SAN-105.
DELETE FROM public.place_details_cache WHERE expires_at < now();
DELETE FROM public.places_search_cache WHERE expires_at < now();
