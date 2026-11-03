-- SAN-1497 · a contender's score depends on the contest maximum, so the whole contest moves
--
-- recompute_entity_tally() normalises by the contest's MAXIMUM audience count
-- (v_audience_norm := v_audience_votes / v_max_audience). The trigger only recomputed the entity
-- whose ballot changed, so when that entity became the new maximum every other contender kept a
-- stale score: one vote each put both at 0.500; a second vote for A should halve B to 0.250, and B
-- stayed at 0.500.
--
-- Fix at the canonical source: recompute every entity in the affected contest.
--
-- ponytail: ceiling — a full contest recompute loops all nominees and each entity helper
-- re-ranks the whole contest, so its rank-update work is O(nominees^2) per ballot plus
-- per-entity vote scans. Acceptable for Phase A (10 restaurant nominees in live data).
-- Upgrade path: batch score/rank refresh at the canonical owner when volume warrants it.

-- Invoker rights: this coordinator runs only from the privileged trigger, and delegates to
-- recompute_entity_tally(). No direct grants: service_role cannot call it independently
-- because vote schema access and the delegate function are deliberately restricted.
create or replace function vote.recompute_contest_tally(p_contest_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'vote', 'public'
as $$
declare
  v_entity_id uuid;
begin
  if p_contest_id is null then
    return;
  end if;

  for v_entity_id in select id from vote.entities where contest_id = p_contest_id loop
    perform vote.recompute_entity_tally(v_entity_id);
  end loop;
end;
$$;

revoke all on function vote.recompute_contest_tally(uuid) from public, anon, authenticated, service_role;

create or replace function vote.trigger_recompute_on_vote()
returns trigger
language plpgsql
security definer
set search_path to 'vote', 'public'
as $$
declare
  v_old_contest uuid;
  v_new_contest uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select e.contest_id into v_old_contest from vote.entities e where e.id = old.entity_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select e.contest_id into v_new_contest from vote.entities e where e.id = new.entity_id;
  end if;

  -- Each affected contest is recomputed once per firing.
  if v_old_contest is not null then
    perform vote.recompute_contest_tally(v_old_contest);
  end if;
  if v_new_contest is not null and v_new_contest is distinct from v_old_contest then
    perform vote.recompute_contest_tally(v_new_contest);
  end if;

  return coalesce(new, old);
end;
$$;
