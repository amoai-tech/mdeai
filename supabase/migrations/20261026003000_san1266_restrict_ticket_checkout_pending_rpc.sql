-- SAN-1266: the guest checkout Edge Function calls this SECURITY DEFINER
-- writer with a service_role client. Direct PostgREST callers must not reserve
-- inventory, mint pending attendee tokens, or create orders without Stripe.
-- This does NOT require customer authentication for guest checkout.
revoke execute on function public.ticket_checkout_create_pending(
  uuid, uuid, integer, text, text, text, jsonb
) from PUBLIC, anon, authenticated;

grant execute on function public.ticket_checkout_create_pending(
  uuid, uuid, integer, text, text, text, jsonb
) to service_role;
