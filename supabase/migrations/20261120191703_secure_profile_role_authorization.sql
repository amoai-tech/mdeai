-- Block ordinary users from elevating their own profiles.role.
-- Supabase retains the trusted public.user_roles/is_admin() authorization path.
-- Phase A remains unrestricted for business workflows; this is a security boundary.
--
-- Existing full-table INSERT/UPDATE grants bypass column-level REVOKE. Remove
-- those table grants first and grant ordinary profile fields explicitly.
-- A profile created without role uses the existing default 'user'::user_role.
revoke insert, update, references, trigger on table public.profiles from anon, authenticated;

revoke insert (role), update (role) on table public.profiles from anon, authenticated;

grant insert (
  id, email, full_name, avatar_url, timezone, currency, language,
  ai_enabled, proactive_suggestions_enabled, notification_preferences,
  onboarding_completed, last_active_at, created_at, updated_at, deleted_at
) on table public.profiles to authenticated;

grant update (
  id, email, full_name, avatar_url, timezone, currency, language,
  ai_enabled, proactive_suggestions_enabled, notification_preferences,
  onboarding_completed, last_active_at, created_at, updated_at, deleted_at
) on table public.profiles to authenticated;

-- Reconcile only the missing sponsor columns consumed by the existing RPC.
-- The hosted application schema intentionally supports ownerless draft inserts
-- from sponsor-application-create; do not add a required owner or an FK that
-- would cascade-delete business history when a contact user is removed.
alter table sponsor.applications
  add column if not exists status text not null default 'draft',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id);

-- Fresh migrations already have owner_user_id on placements but no destination;
-- hosted has a required destination but no owner column. Do not add NOT NULL
-- constraints to existing records whose ownership or destination is unknown.
alter table sponsor.placements
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null,
  add column if not exists utm_destination text;

-- Only the trusted user_roles-based check is allowed to approve sponsors.
-- Reuse the original sponsor approval transaction, without trusting
-- the user-editable profiles.role display field.
create or replace function public.approve_sponsor_application(
  p_application_id uuid, p_approved_by uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller_id uuid;
  v_app sponsor.applications%rowtype;
  v_owner_user_id uuid;
  v_utm_destination text;
  v_surfaces text[];
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null then
    raise exception 'UNAUTHORIZED: must be logged in';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN: admin role required';
  end if;

  select * into v_app
    from sponsor.applications
   where id = p_application_id
   for update;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;
  if v_app.status not in ('submitted', 'under_review') then
    raise exception 'APPLICATION_NOT_APPROVABLE: %', v_app.status;
  end if;

  -- Fresh sponsor applications store the real owner directly; the hosted
  -- application refers to its organization, whose authenticated contact owns
  -- the sponsorship. No caller-supplied identity is used for either path.
  -- A missing owner remains NULL, not a fabricated admin/sponsor identity.
  -- Use the sponsor's supplied HTTP(S) website with a plausible DNS host
  -- and numeric port in the WHATWG range 0..65535 when present.
  -- Reject malformed authorities/ports instead
  -- of persisting a broken URL; not a business approval/ownership gate.
  -- A generic, existing /sponsors page is the development fallback; never
  -- build a non-existent /sponsor/<application-id> destination.
  -- to_jsonb keeps compatibility with the fresh schema, which lacks website.
  select
    coalesce(
      (to_jsonb(v_app)->>'owner_user_id')::uuid,
      (to_jsonb(o)->>'primary_contact_user_id')::uuid,
      (to_jsonb(o)->>'owner_user_id')::uuid
    ),
    case
      when btrim(coalesce(to_jsonb(o)->>'website', ''))
           ~* '^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
        and coalesce(
          substring(
            btrim(to_jsonb(o)->>'website')
            from '^https?://[^/?#:]+:([0-9]{1,5})([/?#]|$)'
          )::integer,
          0
        ) <= 65535
      then btrim(to_jsonb(o)->>'website')
      else 'https://mdeai.co/sponsors'
    end
  into v_owner_user_id, v_utm_destination
  from sponsor.organizations o
  where o.id = v_app.organization_id;

  v_surfaces := case v_app.activation_type
    when 'digital' then array['contest_header', 'leaderboard_footer']
    when 'title_naming' then array['contest_header', 'digital_banner']
    when 'category_powered_by' then array['category_header']
    when 'contestant_sponsor' then array['contestant_profile']
    when 'venue_sponsor' then array['qr_station']
    else array['contest_header']
  end;

  update sponsor.applications
     set status = 'approved',
         approved_at = now(),
         approved_by = v_caller_id
   where id = p_application_id;

  insert into sponsor.placements
    (application_id, owner_user_id, surface, utm_destination, start_at, end_at, weight)
  select
    p_application_id,
    v_owner_user_id,
    unnest(v_surfaces),
    v_utm_destination,
    now(),
    now() + interval '90 days',
    case v_app.tier
      when 'gold' then 150
      when 'premium' then 200
      else 100
    end;
end;
$function$;

-- Align legacy voting-admin RLS checks with the same trusted admin source.
-- This changes neither table ownership nor ordinary public voting access.
alter policy entities_admin_select on vote.entities
  using ((select public.is_admin()));

alter policy entities_admin_update on vote.entities
  using ((select public.is_admin()));
