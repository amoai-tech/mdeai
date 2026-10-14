-- SAN-1484 · Phase A — remove end-user access to private contest identity data and definer helpers
--
-- THE DEFECT (read-only production audit, 2026-10-14, origin/main c0f3d730)
--
--   * vote.entities carries a TABLE-WIDE select grant for anon and a table-wide
--     select/insert/update grant for authenticated. Its columns include private
--     identity-document URLs (id_front_url, id_back_url, waiver_url). RLS is row-level:
--     entities_select exposes approved rows in a live/closed contest, so those URL columns
--     would be readable if the table were reachable. In PostgreSQL a table-wide grant confers
--     the privilege on every column, and a column-level revoke does not subtract from it, so
--     the table-wide grant itself must be removed.
--
--   * vote.recompute_entity_tally(uuid), vote.trigger_recompute_on_vote() and
--     vote.trigger_recompute_on_judge_score() are security definer and inherit execute to
--     PUBLIC (acldefault), so anon and authenticated can call them directly.
--
-- ACTUAL REACHABILITY — measured, not assumed
--
--   * The live authenticator role sets pgrst.db_schemas=public,sponsor. The vote schema is NOT
--     exposed by the Data API, so today these grants are not reachable over /rest/v1. This is
--     least-privilege hardening and future-proofing, not a live incident.
--   * The identity-document columns currently hold zero non-null values (0 of 5 entities):
--     the exposure is latent.
--   * service_role holds no privileges on any vote table, and no USAGE on the vote schema, so
--     removing PUBLIC execute cannot break a working service path. No grant is added here: a
--     future authorized server caller must be granted explicitly as part of SAN-1482/SAN-1289.
--
-- WHY REVOKING TRIGGER-FUNCTION EXECUTE IS SAFE
--
--   PostgreSQL checks a trigger function's execute privilege when the trigger is created, not
--   when it fires, and the security definer helpers run as their owner regardless. This is the
--   same documented mechanism proven behaviourally in 20260920130000_san1284c. No function body
--   and no trigger binding is changed here.
--
-- SCOPE
--
--   Phase A only: end-user access to vote.entities and the three definer helpers.
--   Phase B (approved restaurant-only public projection) is deliberately NOT here; it depends on
--   the restaurant mapping owned by SAN-1483.
--   vote.contests and vote.entity_tally keep their existing end-user select grants: they hold no
--   identity data, the schema is not API-exposed, and a schema-wide access model is SAN-1482's job.
--
-- IDEMPOTENT: REVOKE is a re-runnable no-op. Guards keep this replay-safe on a fresh rebuild
-- where the production-only vote schema is not yet present in migrations (SAN-1482).

-- ── 1. vote.entities: remove table-wide grants from end-user roles ────────────────
do $$
begin
  if to_regclass('vote.entities') is not null then
    revoke select on table vote.entities from public, anon, authenticated;
    revoke insert, update, delete on table vote.entities from public, anon, authenticated;
  end if;
end
$$;

-- ── 2. vote definer helpers: remove direct execute from end-user roles ────────────
do $$
begin
  if to_regprocedure('vote.recompute_entity_tally(uuid)') is not null then
    revoke execute on function vote.recompute_entity_tally(uuid) from public, anon, authenticated;
  end if;

  if to_regprocedure('vote.trigger_recompute_on_vote()') is not null then
    revoke execute on function vote.trigger_recompute_on_vote() from public, anon, authenticated;
  end if;

  if to_regprocedure('vote.trigger_recompute_on_judge_score()') is not null then
    revoke execute on function vote.trigger_recompute_on_judge_score() from public, anon, authenticated;
  end if;
end
$$;
