-- SAN-492 · EVT-033 — advisor remediation (lint 0028):
-- bookings_validate_event_resource is a trigger function; it must not be
-- callable via the REST API. Triggers fire as table owner regardless.
revoke all on function public.bookings_validate_event_resource() from public, anon, authenticated;
