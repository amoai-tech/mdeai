-- SAN-1542 · Restaurant reservation inbox read scope
--
-- A restaurant partner must see real booking requests for the restaurant assigned
-- to their partner account, and must never see another restaurant's request.
--
-- The read follows public.restaurants.partner_id (SAN-1540), which is server
-- controlled. It deliberately does NOT join on google_place_id: partner members can
-- edit their own partner_locations.google_place_id, so a Place ID match proves nothing.
--
-- Nothing is fabricated: with no rows the UI shows an honest empty state, and this
-- migration adds no confirmation, availability or booking-status behaviour.

drop policy if exists venue_booking_select_partner_restaurant on public.venue_booking_requests;
create policy venue_booking_select_partner_restaurant
  on public.venue_booking_requests
  for select
  to authenticated
  using (
    restaurant_id is not null
    and exists (
      select 1
      from public.restaurants r
      where r.id = restaurant_id
        and r.partner_id in (select public.partner_ids_for_user())
    )
  );

-- MDE Team keeps full operational visibility of requests (the same authority the
-- existing server-only booking readers use). This is not a partner permission.
drop policy if exists venue_booking_admin_select on public.venue_booking_requests;
create policy venue_booking_admin_select
  on public.venue_booking_requests
  for select
  to authenticated
  using (public.is_admin());
