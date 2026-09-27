SAN-1349 · verification of the four "recommended focus areas" (review round 3)
Head: c1ab9afbb05ddb144367e20e2e02cda6c44cb9f6
Captured: 2026-09-27

Method: each claim was checked against the PR's current diff and the current
files at HEAD, not against the description. Claims that did not survive contact
with the diff are recorded as disproven with the command that disproves them.

--------------------------------------------------------------------------------
Claim 1 — "Missing validation migration in diff"
  20260927200926_san1349_validate_owner_boundary.sql is referenced in the
  runbook and remediation comments but not included in the provided diff.
Verdict: DISPROVEN — present in the diff.

$ gh pr diff 131 --name-only | grep -E '^supabase/(migrations|tests)/'
supabase/migrations/20260927200924_san1349_enforce_owner_boundary.sql
supabase/migrations/20260927200925_san1349_remediate_ownerless_supply.sql
supabase/migrations/20260927200926_san1349_validate_owner_boundary.sql
supabase/tests/database/san1054_ai_authorization_test.sql
supabase/tests/database/san1286_atomic_viewing_test.sql
supabase/tests/database/san1349_broker_ownership_rls_test.sql

$ gh pr diff 131 --name-only | wc -l
42

The validation migration is file 1 of 3 and the test above is its coverage.
The reviewer's tool was working from a truncated diff, the same failure mode
that produced the earlier "implementation not visible" claim.

The specific asks behind the claim, answered from the file at HEAD:

  predicate        (20260927200924, lines 46-55, verbatim)
                     ALTER TABLE public.apartments
                       ADD CONSTRAINT apartments_owner_required_when_published
                       CHECK (
                         NOT (
                           status = 'active'
                           AND moderation_status = 'approved'
                           AND listing_workflow_status = 'published'
                         )
                         OR landlord_id IS NOT NULL
                       ) NOT VALID;
                   i.e. active + approved + published IMPLIES landlord_id
                   IS NOT NULL. The predicate is exactly the canonical chain:
                   landlord_id is REQUIRED by the constraint, and landlord_id
                   itself is the FK to landlord_profiles.id, which is owned by
                   landlord_profiles.user_id, which is auth.users.id.

  NOT VALID         Deliberate and documented at 20260927200924 line 11:
                   installed NOT VALID so the 44 historical ownerless rows can
                   be remediated first.

  VALIDATED         20260927200926 line 49 runs
                     VALIDATE CONSTRAINT apartments_owner_required_when_published;
                   guarded by an explicit violating-row count, and re-running is
                   a no-op. So the end state is a fully VALIDATED constraint, not
                   a lingering NOT VALID one.

  deferrability      Not deferrable, intentionally. A deferrable constraint
                   would let a transaction commit an ownerless published row and
                   only fail at COMMIT; the durability requirement in the ticket
                   wants the write rejected at the statement. Covered by pgTAP
                   I1/I3.

  proof             supabase/tests/database/san1349_broker_ownership_rls_test.sql
                   B1/B2/B3 assert the constraint exists, is VALIDATED, and binds
                   landlord_id to the approved + published state. On the
                   pre-migration baseline those three fail (11 not_ok total); on
                   HEAD they pass (0 not_ok).

--------------------------------------------------------------------------------
Claim 2 — "Application-layer enforcement not visible"
  The RPC changes that reject ownerless apartments at request time and the RLS
  policies showings_select_visible / leads_select_broker_listing are not shown.
Verdict: DISPROVEN — both are in 20260927200924_san1349_enforce_owner_boundary.sql,
which is in the diff (see claim 1).

RPC (20260927200924, function body):
  line  64  CREATE OR REPLACE FUNCTION public.p1_schedule_tour_atomic(
  line  79  SECURITY DEFINER
  line 182  AND a.landlord_id IS NOT NULL      <- new-request eligibility
  line 192  AND a.landlord_id IS NOT NULL      <- committed-viewing replay path
  line 198  RAISE EXCEPTION 'p1_schedule_tour_atomic: listing is not requestable'

Both eligibility branches require landlord_id IS NOT NULL, and the function
raises P0001 rather than returning a row, so a direct service-role RPC call on
an ownerless listing is rejected before any write. pgTAP H2/H3/H4 assert the
rejection for unapproved / unpublished / ownerless listings respectively, and
H6/H7 assert no lead and no showing were created.

RLS (20260927200924, section C "Broker authorization is the canonical
landlord_id chain alone"):
  line 448  DROP POLICY IF EXISTS showings_select_visible ON public.showings;
  line 449  CREATE POLICY showings_select_visible ... USING ( ... landlord_id IN
            (SELECT public.acting_landlord_ids()) )
  line 472  DROP POLICY IF EXISTS showings_update_visible ON public.showings;
  line 473  CREATE POLICY showings_update_visible ... USING (...) WITH CHECK (...)
  line 509  WITH CHECK ( ... landlord_id IN (SELECT public.acting_landlord_ids()) )

The legacy `a.host_id = auth.uid()` branch is removed; the file documents at
line 31 that it authorized a broker from a column that was never populated
(production host_id set on 0 of 49 rows). Authorization is now the
landlord_profiles chain alone. pgTAP G2 asserts host_id alone grants no access.

Reviewer's residual question — "the application must also reject requests for
any ownerless apartments that might exist in other states": answered. The
constraint only constrains the requestable state (active + approved +
published); the RPC independently requires landlord_id on BOTH the replay and
the new-request path, so a listing that is active+approved but unpublished with
no owner is rejected at the RPC too. Availability is fail-closed: a null or
missing field rejects.

--------------------------------------------------------------------------------
Claim 3 — "Pre-existing pgTAP failures could mask regressions"
  4 failures in the suite, related to search_path.
Verdict: TRUE but NOT MASKING — the baseline is identical to the post state,
and the SAN-1349 suite moved from 11 failures to 0.

Evidence: docs/tasks/evidence/SAN-1349/04-baseline-vs-post-migration.txt, a
comparison against a pg_restore of a snapshot taken BEFORE the migrations.

  test file                                  pre-migration   post-migration
  fashionos_rls_exposure_test                1 not_ok        1 not_ok
  san1284c_trigger_internal_function_acls    1 not_ok        1 not_ok
  san1331a_trigger_search_path               2 not_ok        2 not_ok
  san1054_ai_authorization                   4 not_ok*       3 TODO + 1 fixed
  san1286_atomic_viewing                     0 not_ok        0 not_ok
  san1349_broker_ownership_rls (NEW)        11 not_ok        0 not_ok

  * the san1054 not_ok 42 in the baseline is the SAN-1349 assertion itself; the
    other three are TODO()s.

The four genuine failures are byte-identical pre and post, so they cannot be
hiding a SAN-1349 regression: the test file that DOES cover SAN-1349 goes from
11 failing assertions to 0. Independent, not inherited.

These four are tracked as separate pre-existing debt (RLS-disabled
spatial_ref_sys, a trigger function's EXECUTE grant, trigger_set_timestamps()
search_path). Out of scope here.

--------------------------------------------------------------------------------
Claim 4 — "Pre-existing Playwright auth failures leave the rental journey
  unvalidated in CI"
Verdict: TRUE ORIGINALLY, NOW SUPERSEDED — the auth failure is still pre-existing
and still reproduced on unmodified HEAD (10-playwright-baseline-probe.txt), but
it did NOT prevent CI from exercising the rental journey.

CI ran the rental assertions and they are decisive. The `deterministic chromium`
job failed on the previous head at e2e/deterministic-critical.spec.ts:164 with
"Expected: 0, Received: 1" — a real CTA-gating defect, which is precisely the
opposite of an unvalidated journey. The job then passed (2m48s) on the fixed
head c1ab9afbb.

So the journey IS validated: the assertion ran, found a genuine defect, and
cleared after the fix. The local-only 401 is an environment characteristic of
this machine, not of CI. The reviewer's inference ("cannot be validated until
the auth issue is resolved") was reasonable from the earlier evidence but does
not hold against the current CI result.

--------------------------------------------------------------------------------
Summary
  1 missing validation migration        DISPROVEN — in diff, VALIDATED, predicate confirmed
  2 application-layer enforcement       DISPROVEN — RPC guard + RLS policies in diff at stated lines
  3 pre-existing pgTAP failures         CONFIRMED as debt / REFUTED as masking — identical baseline, SAN-1349 11→0
  4 pre-existing Playwright auth        CONFIRMED pre-existing / REFUTED as a verification gap — CI ran it and passed

No code change was required by any of the four. The only change this round is
the previously-failing CI job now passing on the fixed head.
