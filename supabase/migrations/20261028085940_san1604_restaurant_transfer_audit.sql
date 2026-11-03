-- SAN-1604 · One authoritative restaurant partner transfer with atomic audit.
-- Development restaurants remain MDE-managed when partner_id IS NULL.
-- A Google Place ID is an untrusted matching hint, never edit authority.

create table if not exists public.restaurant_partner_assignment_audit (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  previous_partner_id uuid,
  new_partner_id uuid,
  actor_user_id uuid,
  actor_role text not null,
  reason text not null,
  changed_at timestamptz not null default clock_timestamp(),
  constraint restaurant_assignment_actual_change
    check (previous_partner_id is distinct from new_partner_id)
);
create index if not exists restaurant_assignment_audit_restaurant_time
  on public.restaurant_partner_assignment_audit (restaurant_id, changed_at desc);
alter table public.restaurant_partner_assignment_audit enable row level security;
revoke all on public.restaurant_partner_assignment_audit from public, anon, authenticated;
grant select on public.restaurant_partner_assignment_audit to service_role;
comment on table public.restaurant_partner_assignment_audit is
  'SAN-1604 append-only record of restaurant partner_id changes. No public API read/write; including direct trusted service updates.';

-- The table is intentionally append-only even to authenticated administrators.
-- Trusted migrations/service maintenance may be audited with a null actor id.
create or replace function private.restaurant_partner_assignment_guard_and_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role text := coalesce(auth.jwt() ->> 'role', '');
  v_reason text := nullif(pg_catalog.current_setting('mde.restaurant_transfer_reason', true), '');
begin
  if old.partner_id is not distinct from new.partner_id then
    return new;
  end if;
  if v_actor is not null then
    if not public.has_role(v_actor, 'super_admin'::public.user_role) then
      raise exception 'restaurant transfer requires Super Admin' using errcode='42501';
    end if;
    -- Direct table updates and the retired assign_partner RPC may not bypass
    -- optimistic locking or reason capture. Only the canonical RPC sets this.
    if pg_catalog.current_setting('mde.restaurant_transfer_actor', true) is distinct from v_actor::text then
      raise exception 'Use restaurant_admin_transfer for partner changes' using errcode='42501';
    end if;
  elsif v_role <> 'service_role' and session_user <> 'postgres' then
    raise exception 'restaurant transfer requires authenticated Super Admin' using errcode='42501';
  end if;
  insert into public.restaurant_partner_assignment_audit (
    restaurant_id, previous_partner_id, new_partner_id, actor_user_id, actor_role, reason
  ) values (
    new.id, old.partner_id, new.partner_id, v_actor,
    case when v_actor is null then 'service_role' else 'super_admin' end,
    coalesce(v_reason, 'Direct administrator or service update')
  );
  return new;
end;
$$;
revoke all on function private.restaurant_partner_assignment_guard_and_audit() from public, anon, authenticated;
drop trigger if exists restaurant_partner_assignment_guard_audit on public.restaurants;
create trigger restaurant_partner_assignment_guard_audit
  after update of partner_id on public.restaurants
  for each row execute function private.restaurant_partner_assignment_guard_and_audit();

-- One audited, optimistic-concurrency-safe writer used by both MDE Team UI
-- and any future authorized admin adapter. The database derives the actor.
create or replace function public.restaurant_admin_transfer(
  p_restaurant_id uuid,
  p_partner_id uuid,
  p_expected_partner_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_row public.restaurants;
  v_audit uuid;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null or not public.has_role(v_actor, 'super_admin'::public.user_role) then
    raise exception 'restaurant_admin_transfer: Super Admin required' using errcode='42501';
  end if;
  if p_restaurant_id is null then
    raise exception 'restaurant_admin_transfer: restaurant id required' using errcode='22023';
  end if;
  if v_reason is null or pg_catalog.length(v_reason) > 240 then
    raise exception 'restaurant_admin_transfer: reason required (max 240 characters)' using errcode='22023';
  end if;
  if p_partner_id is not null
     and not exists (select 1 from public.partners where id=p_partner_id) then
    raise exception 'restaurant_admin_transfer: partner not found' using errcode='P0002';
  end if;

  select * into v_row from public.restaurants where id=p_restaurant_id for update;
  if not found then
    raise exception 'restaurant_admin_transfer: restaurant not found' using errcode='P0002';
  end if;
  -- A replay of an already persisted transfer is a no-op, never a second audit.
  if v_row.partner_id is not distinct from p_partner_id then
    return pg_catalog.jsonb_build_object('restaurantId',v_row.id,'partnerId',v_row.partner_id,'changed',false,'updatedAt',v_row.updated_at);
  end if;
  if v_row.partner_id is distinct from p_expected_partner_id then
    raise exception 'restaurant_admin_transfer: assignment changed; refresh before saving' using errcode='P0001';
  end if;

  perform pg_catalog.set_config('mde.restaurant_transfer_actor', v_actor::text, true);
  perform pg_catalog.set_config('mde.restaurant_transfer_reason', v_reason, true);
  update public.restaurants set partner_id=p_partner_id where id=p_restaurant_id
    returning * into v_row;
  select id into v_audit from public.restaurant_partner_assignment_audit
    where restaurant_id=p_restaurant_id and actor_user_id=v_actor
    order by changed_at desc limit 1;
  if v_audit is null then
    raise exception 'restaurant_admin_transfer: audit was not persisted' using errcode='P0001';
  end if;
  return pg_catalog.jsonb_build_object('restaurantId',v_row.id,'partnerId',v_row.partner_id,'changed',true,'auditId',v_audit,'updatedAt',v_row.updated_at);
end;
$$;
revoke all on function public.restaurant_admin_transfer(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.restaurant_admin_transfer(uuid,uuid,uuid,text) to authenticated;
-- Retire the old non-concurrent assignment endpoint; use the one audited writer.
revoke all on function public.restaurant_assign_partner(uuid,uuid) from public, anon, authenticated;
