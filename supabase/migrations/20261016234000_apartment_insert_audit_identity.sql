-- SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates
-- Audit identity on insert is set by the server, never by the client.
--
-- Ordinary signed-in users hold column-level INSERT on published_by, published_at, workflow_changed_by and
-- workflow_changed_at (they have no UPDATE on them). enforce_apartment_initial_state() did not touch those
-- columns for ordinary callers, so a user could create an apartment that claims ANOTHER person published it,
-- or claim an invented publication time. That is a forged audit trail, not a business gate.
--
-- Unchanged on purpose (development stays fully open): an ordinary user can still create an apartment that is
-- active and published in development, with no moderation, ownership verification or publishing approval;
-- `verified` is still forced to false for ordinary callers; administrators and service/owner roles are still
-- trusted to set explicit values (the publish RPCs run as owner). The launch rule that new apartments start as
-- inactive/pending/draft is unchanged.
--
-- Changed: for an ordinary caller, on every insert (development and launch)
--   * workflow_changed_by / workflow_changed_at = the authenticated actor / now();
--   * published_by / published_at = the actor / now() when the row is created as 'published', otherwise NULL.
--
-- Forward-only (create or replace); the original migrations are already applied and are not edited.

create or replace function public.enforce_apartment_initial_state()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if public.is_admin() or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if public.rental_development_active() then
    -- Phase A: development publication stays open; only the independent-verification flag is not self-set.
    new.verified := false;
  else
    new.status := 'inactive';
    new.moderation_status := 'pending';
    new.listing_workflow_status := 'draft';
    new.verified := false;
  end if;

  -- who/when is recorded by the server from the real actor, in both phases
  new.workflow_changed_by := auth.uid();
  new.workflow_changed_at := now();
  if new.listing_workflow_status = 'published' then
    new.published_by := auth.uid();
    new.published_at := now();
  else
    new.published_by := null;
    new.published_at := null;
  end if;
  return new;
end;
$function$;
