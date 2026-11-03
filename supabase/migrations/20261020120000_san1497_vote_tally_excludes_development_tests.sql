-- SAN-1497 · the tally must not count development-test ballots as audience votes
--
-- vote.votes has carried a `development_test` boolean, but `vote_tally` never read it: every count
-- filtered on source/fraud_status only. Two consequences, both visible to users once a leaderboard
-- exists:
--
--   * `development_test_total` was an exact duplicate of `audience_total` — the same predicate with
--     a different key, so it could never report anything else;
--   * a test ballot (clean) incremented `audience_accepted`, so development scaffolding would have
--     appeared as real votes in the standings.
--
-- The fix is the canonical function, not a second tally: test ballots are counted separately and
-- excluded from every audience figure. The grants on the existing function are preserved.

create or replace function public.vote_tally(p_entity_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'entity_id', p_entity_id,
    'application_phase', private.mde_application_phase(),
    'audience_accepted', count(*) filter (
      where v.source = 'audience' and v.fraud_status = 'clean' and not v.development_test),
    'audience_pending', count(*) filter (
      where v.source = 'audience' and v.fraud_status in ('pending', 'suspicious') and not v.development_test),
    'audience_total', count(*) filter (
      where v.source = 'audience' and v.fraud_status <> 'blocked' and not v.development_test),
    'development_test_total', count(*) filter (
      where v.development_test and v.fraud_status <> 'blocked')
  )
  from vote.votes v
  where v.entity_id = p_entity_id;
$$;

comment on function public.vote_tally(uuid) is
  'Audience totals exclude development_test ballots; those are reported separately so test data can never be read as a real vote.';
