-- SAN-1497 · keep vote.entity_tally in step with the ballots it summarises
--
-- The projection was refreshed by an AFTER INSERT trigger only. Two realistic sequences therefore
-- left vote.entity_tally — which stores audience_votes, weighted_total and rank — describing a
-- ballot set that no longer existed:
--
--   * a ballot reviewed from pending/suspicious to clean, or flagged blocked;
--   * a ballot deleted or corrected.
--
-- The function also assumed NEW was always present, so it could not serve DELETE. It now recomputes
-- both the old and the new entity when they differ.

create or replace function vote.trigger_recompute_on_vote()
returns trigger
language plpgsql
security definer
set search_path to 'vote', 'public'
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform vote.recompute_entity_tally(old.entity_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.entity_id is distinct from old.entity_id) then
    perform vote.recompute_entity_tally(new.entity_id);
  elsif tg_op = 'UPDATE' then
    perform vote.recompute_entity_tally(new.entity_id);
  end if;
  return coalesce(new, old);
end;
$$;

-- A review-state change is exactly what the old trigger missed; the ballot's own columns decide the
-- counts, so those are the columns worth watching.
drop trigger if exists tr_recompute_tally_on_vote on vote.votes;
create trigger tr_recompute_tally_on_vote
  after insert or delete or update of fraud_status, source, development_test, entity_id
  on vote.votes
  for each row execute function vote.trigger_recompute_on_vote();
