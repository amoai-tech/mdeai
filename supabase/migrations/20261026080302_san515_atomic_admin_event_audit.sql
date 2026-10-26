-- SAN-515: make an admin event state change and its audit atomic.
-- No business approval or other Phase A eligibility requirement is added.
begin;

create table if not exists public.admin_event_state_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  actor_id uuid not null,
  action text not null check (action in ('publish', 'unpublish', 'restore', 'edit')),
  before_status text not null,
  before_is_active boolean not null,
  after_status text not null,
  after_is_active boolean not null,
  before_fields jsonb,
  after_fields jsonb,
  created_at timestamptz not null default now()
);
-- Store identifiers without foreign keys so deleted users/events do not erase
-- historical action evidence. Do not allow audit rows to be changed or deleted.
create index if not exists admin_event_state_audit_event_created_idx
  on public.admin_event_state_audit (event_id, created_at desc);
-- Admin may read tiers on a foreign organizer's event in the existing editor.
-- Keep ordinary users restricted to the organizer-owned ticket policy.
create policy event_tickets_admin_select on public.event_tickets
  for select to authenticated using ((select public.is_admin()));

alter table public.admin_event_state_audit enable row level security;
revoke all on table public.admin_event_state_audit from public, anon, authenticated;
grant select on table public.admin_event_state_audit to authenticated;
create policy admin_event_state_audit_admin_read on public.admin_event_state_audit
  for select to authenticated using ((select public.is_admin()));

create or replace function public.admin_event_set_state(
  p_event_id uuid, p_action text
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_before public.events%rowtype;
  v_after public.events%rowtype;
  v_status text;
  v_active boolean;
  v_audit_id uuid;
begin
  if v_actor is null or not coalesce(public.is_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_action = 'publish' then
    v_status := 'published'; v_active := true;
  elsif p_action = 'unpublish' then
    v_status := 'draft'; v_active := false;
  elsif p_action = 'restore' then
    v_status := 'draft'; v_active := true;
  else
    raise exception 'invalid event transition' using errcode = '22023';
  end if;

  select * into v_before from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  update public.events
    set status = v_status, is_active = v_active, updated_at = clock_timestamp()
    where id = p_event_id returning * into v_after;
  insert into public.admin_event_state_audit (
    event_id, actor_id, action, before_status, before_is_active,
    after_status, after_is_active
  ) values (
    p_event_id, v_actor, p_action, v_before.status, v_before.is_active,
    v_after.status, v_after.is_active
  ) returning id into v_audit_id;
  return jsonb_build_object('status', v_after.status, 'is_active', v_after.is_active, 'audit_id', v_audit_id);
end;
$function$;
-- Content edits from the existing organizer editor are also audited when
-- the actor is an admin editing any event. Ordinary organizers retain their
-- existing owner-only editor and do not create admin audit records.
create or replace function public.audit_admin_event_content_edit()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is not null and coalesce(public.is_admin(), false)
    and row(old.name, old.description, old.address, old.city,
            old.event_start_time, old.event_end_time)
        is distinct from
        row(new.name, new.description, new.address, new.city,
            new.event_start_time, new.event_end_time) then
    insert into public.admin_event_state_audit (
      event_id, actor_id, action, before_status, before_is_active,
      after_status, after_is_active, before_fields, after_fields
    ) values (
      new.id, auth.uid(), 'edit', old.status, old.is_active,
      new.status, new.is_active,
      jsonb_build_object('name',old.name,'description',old.description,
        'address',old.address,'city',old.city,
        'event_start_time',old.event_start_time,'event_end_time',old.event_end_time),
      jsonb_build_object('name',new.name,'description',new.description,
        'address',new.address,'city',new.city,
        'event_start_time',new.event_start_time,'event_end_time',new.event_end_time)
    );
  end if;
  return new;
end;
$function$;
create trigger audit_admin_event_content_update
  after update on public.events
  for each row execute function public.audit_admin_event_content_edit();
revoke all on function public.audit_admin_event_content_edit()
  from public, anon, authenticated;

revoke all on function public.admin_event_set_state(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_event_set_state(uuid, text) to authenticated;
commit;
