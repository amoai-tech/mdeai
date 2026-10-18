-- SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates
-- Development discovery must never depend on status/approval/publishing/owner flags.
-- The duplicated authenticated policy exposed explicit test fixtures (permissive RLS policies
-- combine with OR). Keep ONE canonical phase-aware discovery predicate; keep private and
-- test-fixture data isolated from unrelated outsiders, while admin/creator/test-actor policies
-- retain their independent authenticated paths.
--
-- This changes two existing canonical functions, not the booking system or a new search layer.
-- In development, status is a management label, not permission to search or inspect.
-- At launch, the existing active/approved/published/owner rules remain unchanged.
-- Forward-only and replay-safe; this migration has NOT been applied to the remote ledger.

create or replace function public.rental_listing_is_public(
  p_status text, p_moderation_status text, p_listing_workflow_status text,
  p_landlord_id uuid, p_metadata jsonb
) returns boolean
language sql stable
set search_path = ''
as $function$
  select coalesce(lower(p_metadata->>'visibility'),'') not in ('private','internal')
    and case when public.rental_development_active() then
      coalesce(lower(p_metadata->>'is_test_fixture'),'false') <> 'true'
      and coalesce(lower(p_metadata->>'inventory_kind'),'') <> 'test_fixture'
    else
      p_status='active' and p_moderation_status='approved'
      and p_listing_workflow_status='published' and p_landlord_id is not null
      and coalesce(lower(p_metadata->>'is_test_fixture'),'false') <> 'true'
      and coalesce(lower(p_metadata->>'inventory_kind'),'') not in ('test_fixture','external_candidate')
      and coalesce(lower(p_metadata->>'inventory_type'),'') <> 'external'
      and coalesce(lower(p_metadata->>'allowed_action'),'') <> 'view_original_listing'
    end;
$function$;

-- Authorized development testers must be able to inspect inactive fixtures without
-- test publication or photo-rights approvals. This is NOT public fixture access:
-- the caller still needs a trusted test-actor grant or the admin/creator policy.
create or replace function public.rental_test_listing_is_available(
  p_status text, p_moderation_status text, p_listing_workflow_status text,
  p_metadata jsonb
) returns boolean
language sql stable
set search_path = ''
as $function$
  select lower(coalesce(p_metadata->>'is_test_fixture','false')) = 'true'
    and (public.rental_development_active() or p_status = 'active');
$function$;

drop policy if exists apartments_authenticated_development_access on public.apartments;

comment on policy anyone_can_view_active_apartments on public.apartments is
  'SAN-1502: canonical apartment discovery via rental_listing_is_public(); development exposes non-private, non-fixture listings regardless of status or business approval. Public launch retains the strict rules. Explicit test fixtures stay with authenticated admin/creator/test-actor policies.';
