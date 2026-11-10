-- SAN-277: trigger functions are not end-user callable.
-- The new function inherited the database's default PUBLIC EXECUTE, so the
-- SAN-1284C catch-all could not have covered it (that migration ran earlier).
revoke execute on function public.validate_trip_timezone() from public, anon, authenticated;
grant execute on function public.validate_trip_timezone() to service_role;
