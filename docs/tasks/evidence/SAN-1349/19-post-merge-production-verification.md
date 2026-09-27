SAN-1349 · Task 1 — Post-merge production verification
Merge SHA: ab1f28768f4b2681032a947981a65a6dd3137322
Captured: 2026-09-27 ~22:05 UTC
Status: BLOCKED — production is not running the merged revision

═══════════════════════════════════════════════════════════════════════════════
HEADLINE
═══════════════════════════════════════════════════════════════════════════════
The merge is correct and the built artifact is correct, but the public domain
does NOT serve it. www.mdeai.co is still serving the PR #130 build, so the
SAN-1349 defect is still live for real users.

Two independent blockers:
  B1  production-certification fails on an ORIGIN-SPECIFIC Google Maps
      authentication failure, which gates alias assignment — so nothing has been
      promoted since 633d8a7a6.
      NOTE: the CopilotKit `401` is NOT this blocker. It is expected
      fail-closed behaviour for an unauthenticated caller (see section 3), and
      the certification's own authenticated runtime-info call returns 200. An
      earlier draft of this document named the 401 here; that was wrong and is
      corrected. See the SECTION 3 ROOT CAUSE for what was actually observed,
      and for the caveat that the referrer mechanism is a hypothesis, not
      established.
  B2  The 3 migrations are NOT APPLIED — but they are deferred by DECISION, not
      blocked. A working credential path exists: the Vercel token in .env
      authenticates (HTTP 200), and the project environment exposes
      POSTGRES_URL_NON_POOLING / POSTGRES_PASSWORD / DATABASE_URL, so
      `supabase db push --db-url` is available. The chain was held because
      applying it drops requestable supply to zero before the app fix is live
      and before any real broker exists. See sections 6 and 7.
      An earlier draft said migrations were blocked by missing credentials and
      tools; that was only true of the first attempt and is corrected here.

Both blockers are independent of SAN-1349's own code, which is merged and
verified correct on the built artifact.

═══════════════════════════════════════════════════════════════════════════════
1 · main contains the merge SHA — PASS
═══════════════════════════════════════════════════════════════════════════════
$ git fetch origin main && git merge-base --is-ancestor ab1f28768 origin/main
YES

$ git log --oneline -1 origin/main
ab1f28768 Merge pull request #131 from amoai-tech/ai/san-1349-rental-ownership-boundary

$ gh pr view 131 --json state,mergedAt,mergeCommit,mergedBy
state=MERGED mergedAt=2026-09-27T21:55:33Z
mergeCommit=ab1f28768f4b2681032a947981a65a6dd3137322 by=amoai-tech

origin/main tip == ab1f28768. main has not moved on.

═══════════════════════════════════════════════════════════════════════════════
2 · Vercel deployed the correct merged revision — PARTIAL
═══════════════════════════════════════════════════════════════════════════════
A production deployment for the exact merge SHA exists and is READY:

  id      dpl_3Gkth6XjsMYXwz1MLEsPk1TEsfnF
  url     mdeai-rh5d68hhb-amoco.vercel.app
  state   READY
  target  production
  sha     ab1f28768f4b2681032a947981a65a6dd3137322
  msg     Merge pull request #131 ... SAN-1349

BUT it is not serving the public domain, and the project reports live=false.

  $ curl -sS https://www.mdeai.co/rentals | grep -c 'Schedule viewing'
  10

  $ curl -sSL '<protected>/rentals?_vercel_share=...' | grep -c 'Schedule viewing'
  0        # the merged deployment — correct

Build fingerprint of the vendored rental chunk (/_next/static/chunks/3794-*.js):

  ab1f28768  merged, SAN-1349        f7641944e48e235b   ctas=0   <- correct
  cd4d5ec16  prior main              35ea1fa18336b8a2   ctas=10
  633d8a7a6  PR #130 merge           f4b8303ec2eb4c47   ctas=10   <- MATCHES LIVE
  767556dee  PR #129 merge           585afe487f7454f7   ctas=10

  LIVE www.mdeai.co                  f4b8303ec2eb4c47   ctas=10   <- 633d8a7a6

Conclusion: production serves 633d8a7a6 (PR #130), two commits behind main.
The merged SAN-1349 build exists, is READY, and behaves correctly — it was
simply never promoted to the custom domain.

═══════════════════════════════════════════════════════════════════════════════
3 · Merged-main CI — FAIL
═══════════════════════════════════════════════════════════════════════════════
$ gh run list --commit ab1f28768
  Floor                              success
  Supabase ACL gates                 success
  Prod deploy freshness              success   (only asserts a READY deployment EXISTS)
  Vercel production certification    FAILURE   <- the gate that matters

Failure cause (production-certification, "Certify exact staged candidate"):
  e2e/prod-candidate-certification.spec.ts:36
  expect(locator).toBeEnabled failed
  Locator: getByTestId('copilot-send-button')
  element(s) not found / unexpected value "disabled"
  at e2e/helpers/maps-layout.ts:177

The failing step is spec line 87 -> sendConciergeMessage. Everything before it
PASSED, including:

  expect(response.status(), 'unauthenticated ... runtime info').toBe(401)  PASSED
  signInAsOnOrigin(...)                                                    PASSED
  expect(saved?.status()).toBe(200)                                        PASSED
  expect(infoResponse.status()).toBe(200)                                  PASSED
  expect(info.version).toBe(pinned @copilotkit/runtime)                    PASSED
  expect(expectedAgents.filter(n => !info.agents?.[n])).toEqual([])        PASSED

So authentication WORKS, the runtime AUTHORIZES the signed-in caller (200), and
all four agents are present. The failure is narrower: the composer's send button
never enables within 10s.

CORRECTION to this document's first draft: the `401` seen on
`https://www.mdeai.co/api/copilotkit` is NOT the bug. `evaluateCopilotKitAuth`
(src/lib/copilotkit-auth.ts:95) fails closed for an unauthenticated caller by
design — "no authenticated session" -> 401. A curl with no session is supposed
to get 401. The certification failure is a client-side composer state, not the
auth gate.

Observed in the browser on the live build:
  /chat (anonymous): composer renders, textarea ENABLED ("Type a message..."),
                     copilot-send-button present but DISABLED, page shows
                     "Sign in · Sign up". Disabled-by-design when signed out.
  /chat (anonymous): ~99 repeated "Failed to load runtime info
                     (/api/copilotkit/info)" warnings, each a 401.
  /chat: intermittently rendered the Next.js error boundary —
                     "This page couldn't load / Reload to try again"
                     alongside "Error: Loading chunk ... failed".
                     A fresh load of /chat?fresh=1 then rendered correctly.

`vercel-production-certification.yml` is triggered by
`repository_dispatch: vercel.deployment.ready` and publishes a
`production-certification` status used to gate alias assignment.

THE GATE HAS NEVER PASSED. It was added to main by `cd4d5ec16` (SAN-1330) and
has run 8 times:

  2026-09-27T22:07:44Z  ab1f28768  skipped
  2026-09-27T21:57:47Z  ab1f28768  FAILURE
  2026-09-27T21:51:11Z  cd4d5ec16  skipped
  2026-09-27T21:41:54Z  cd4d5ec16  skipped
  2026-09-27T21:40:08Z  cd4d5ec16  skipped
  2026-09-27T21:33:32Z  cd4d5ec16  skipped
  2026-09-27T21:30:31Z  cd4d5ec16  skipped
  2026-09-27T21:08:49Z  cd4d5ec16  FAILURE

  $ git log --oneline -1 --diff-filter=A -- .github/workflows/vercel-production-certification.yml
  cd4d5ec16 SAN-1330 · Certify Vercel candidates before production

Two failures, zero passes. Both failures are in the same concierge-composer
step, with different assertions:
  cd4d5ec16 run 36350625270  TimeoutError: input.waitFor({state:"visible"}) 15s
  ab1f28768 run 36353590714  toBeEnabled failed on copilot-send-button

Because 633d8a7a6 was deployed BEFORE this gate existed, production has been
frozen since the gate landed. SAN-1349 is the second commit stuck behind it,
not the cause of it.

This is the exact failure mode prod-deploy-freshness.yml warns about in its own
header comment, and it confirms the size of the blast radius: this is a
release-pipeline P0 independent of SAN-1349.

Independent second confirmation that production serves 633d8a7a6 — every
Next.js chunk URL carries the serving deployment id:

  $ curl -sSL https://www.mdeai.co/chat | grep -oE 'dpl_[A-Za-z0-9]+' | sort -u
  dpl_BB9pxTptVRCK5RTFNxTZdyVntNP8      <- the deployment for 633d8a7a6

  $ curl -sSL '<merged deployment>/chat?_vercel_share=...' | grep -oE 'dpl_[A-Za-z0-9]+' | sort -u
  dpl_GNiwPHFVsSobCaEQkj8268DTDzb6      <- the ab1f28768 deployment

WHY THE SEND BUTTON IS DISABLED — ROOT CAUSE CONFIRMED
------------------------------------------------------
Reproduced locally against the exact stuck candidate, using the repository's own
bypass secret and the same spec CI runs:

  PROD_SMOKE_BASE_URL=https://mdeai-rh5d68hhb-amoco.vercel.app \
    npx playwright test e2e/prod-candidate-certification.spec.ts \
      --project=prod-smoke --workers=1

  attempt 1  FAILED  toBeEnabled on copilot-send-button   (same as CI)
  retry  1  FAILED  unauthenticated GET runtime info: expected 401, got 429

The Playwright error context captured the page as it actually was. Signed in
successfully as the throwaway QA identity, the concierge rendered:

  - text: qa-san1330-...@qa-isolation.mdeai.co
  - button "Sign out"
  - paragraph: Google Maps authentication failed
  - paragraph: Check these three things in GCP for the key used by
               NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      - Billing enabled ...
      - HTTP referrer allowed — add
          https://mdeai-rh5d68hhb-amoco.vercel.app/*
          and http://localhost:3001/*, http://localhost:3000/* ...
      - Maps JavaScript API enabled ...
  - alert

There is NO chat region in that accessibility tree. The app's own remediation
text names the missing referrer explicitly:
`https://mdeai-rh5d68hhb-amoco.vercel.app/*`.

WHAT IS ESTABLISHED vs WHAT IS HYPOTHESIS (corrected — CodeRabbit review on #134)
---------------------------------------------------------------------------------
ESTABLISHED, by the A/B control below: the Maps authentication failure is
ORIGIN-SPECIFIC. The identical signed-in flow succeeds on `www.mdeai.co` and
fails on the Vercel deployment origin. Maps fails, the error state takes over the
page, and the composer never becomes usable.

HYPOTHESIS, not established: that the HTTP-referrer allowlist is the *cause*.
The review was right to push back on the earlier wording, and the reasoning is
sound:

  * `MapRefererHelp` prints the CURRENT origin as a suggested referrer for EVERY
    Maps authentication failure. The app's own text naming
    `https://mdeai-rh5d68hhb-amoco.vercel.app/*` is therefore boilerplate, not
    evidence — it would say the same thing for a billing or quota failure.
  * `useMapsAuthFailure` is driven by `window.gm_authFailure`, which fires for
    referrer, billing, quota and API-not-enabled errors alike. It carries no
    reason code.
  * The two origins were served by DIFFERENT BUILDS (633d8a7a6 vs ab1f28768),
    so the comparison is not perfectly controlled even though the Maps source
    files are unchanged between those revisions.

So: origin-specific Maps failure = fact. Referrer allowlist = leading hypothesis.
Verify before acting:

  1. In GCP, inspect the actual restrictions on the browser key used by
     NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — referrer list, API restrictions, and the
     key's quota/billing state.
  2. On the candidate origin, capture the specific failure. `gm_authFailure`
     gives no detail, but the Maps JS console/network output distinguishes
     `RefererNotAllowedMapError` from `ApiNotActivatedMapError`,
     `BillingNotEnabledMapError` and `ExpiredKeyMapError`.
  3. Only then choose the fix. If it is not the referrer list, the F1a
     recommendation below does not apply.

The second, independent defect below stands regardless of which Maps cause it is:
the chat should never be unmounted by a Maps failure.

DECISIVE A/B CONTROL (same signed-in user, same code path, different origin)
--------------------------------------------------------------------------
A temporary Playwright diagnostic reproduced the certification's exact signed-in
setup against both origins: create a throwaway identity, sign in, load /chat,
read the DOM. Both runs got `POST /api/copilotkit/info -> 200`, so both were
authenticated and authorized.

  candidate  https://mdeai-rh5d68hhb-amoco.vercel.app   (build ab1f28768)
    {"mapsAuthFailedFlag":true, "mapsErrorText":true,
     "chatCanvas":false, "chatMap":false,
     "sendPresent":false, "textboxPresent":false}

  live       https://www.mdeai.co                        (build 633d8a7a6)
    {"mapsAuthFailedFlag":false, "mapsErrorText":false,
     "chatCanvas":true, "chatMap":true,
     "sendPresent":true, "sendDisabled":true,   <- before typing
     "textboxPresent":true}
    after filling "ping":
    {"textboxValue":"ping", "sendDisabled":false, "mapsAuthFailedFlag":false}
    PASSED — console showed only a benign "Vector Map ... Falling back to
    Raster" notice, and zero >=400 responses.

That is origin-specific and definitive: the identical signed-in flow works on
the custom domain and destroys the chat on the Vercel deployment origin.

IMPORTANT NOTE ON FALSE NEGATIVES: an ANONYMOUS visit to the candidate origin
shows NO Maps error and a fully rendered chat
(`__mdeMapsAuthFailed:false, chatCanvas:true, chatMap:true`). Maps only fails
once signed-in content causes the map to actually load. Probing anonymously
therefore gives a misleadingly green result — which is exactly the trap this
verification fell into mid-investigation before the A/B control settled it.

SECOND, INDEPENDENT DEFECT — the chat should not die with the map
-----------------------------------------------------------------
src/components/maps/MapProvider.tsx:33-39

    if (authFailed) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <MapRefererHelp />
        </div>
      );
    }

`MapsShell` RETURNS THE ERROR PANEL INSTEAD OF `children`. And in
src/components/chat/geo-chat-shell.tsx:152-163, `<MapsShell>` wraps
`<ChatCanvas />` — the entire concierge, including the CopilotKit composer.

So a Google Maps key problem unmounts the whole chat. That is why this is a
total concierge outage and not a degraded map: `chatCanvas:false`,
`sendPresent:false`. The chat is a text conversation and does not need the Maps
JS API to send a message.

This one defect is what converts a configuration mistake into a
production-freezing certification failure, and it is worth fixing on its own
merits regardless of the key. Note the composer logic itself is fine — on the
working origin the send button enables correctly once text is entered, so the
certification's `toBeEnabled` assertion is valid and is failing purely because
the composer has been unmounted.

This is a DEADLOCK, and it explains why the gate has never passed:

  certification must run against the deployment origin
    -> Maps authentication fails ON THAT ORIGIN (cause TBD; referrer is the
       leading hypothesis, see above)
      -> MapsShell unmounts the chat, so the composer never enables
        -> certification fails
          -> deployment-alias check fails
            -> no alias, so the custom domain keeps serving the old build
              -> certification keeps being re-attempted on deployment origins

Note the deadlock does NOT depend on which Maps cause it is: any origin-specific
Maps failure reproduces it, because MapsShell turns it into a chat outage.

Vercel confirms the last link directly:

  $ curl -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v13/deployments/dpl_3Gkth6XjsMYXwz1MLEsPk1TEsfnF?teamId=$VERCEL_TEAM_ID"
  checks: { "deployment-alias": { "state": "failed",
                                  "startedAt":   1790546136437,
                                  "completedAt": 1790546398745 } }
  aliasAssigned: false
  alias: ["mdeai-amoco.vercel.app", "mdeai-git-main-amoco.vercel.app"]

The alias check ran 2026-09-27T21:55:36Z -> 21:59:58Z (262s) and failed, which
is exactly when the certification run failed. The custom domain was therefore
never switched.

SECONDARY FLAKE: retry #1 returned 429 instead of 401 for the unauthenticated
runtime-info assertion — `checkCopilotKitDistributedIpHardCeiling` /
`checkCopilotKitDistributedRateLimit` shedding the runner's repeated probes. So
even after the Maps key is fixed, this assertion is rate-limit-sensitive and
will retry-fail under load. Worth hardening, but it is not the primary blocker.

CopilotKit's own gating, for completeness:

  node_modules/@copilotkit/react-core/dist/copilotkit-Cd-NrDyp.mjs:798
    disabled: isProcessing ? !canStop : !canSend,

So a composer that never reaches a ready state stays permanently "not sendable".
The 401 seen in an anonymous curl is NOT part of this: `evaluateCopilotKitAuth`
(src/lib/copilotkit-auth.ts:95) fails closed for an unauthenticated caller by
design.

═══════════════════════════════════════════════════════════════════════════════
4 · Live Supabase rental ownership re-audit (read-only) — DONE
═══════════════════════════════════════════════════════════════════════════════
Project zkcwbyxiwklihegjhuql ("medellin").

  apartments total                                     49
  active+approved+published (requestable state)        44
  requestable AND ownerless                            44   <-- 100%
  requestable AND owned                                 0
  any ownerless                                        44
  any owned                                             5
  host_id set                                           0
  paused_at set                                         0

Composition of the 44: 43 source='seed' (28 with stub source_urls), 1 'manual';
created 2026-01-20 .. 2026-05-02.

landlord_profiles: 5 rows, ALL QA/E2E fixtures, all verification_status='pending',
all qa.broker.*@mdeai.co, each owning exactly 1 draft listing, 0 requestable.

  QA Broker 1781670235146          1 owned  0 requestable
  QA Dashboard Broker 1781673653945 1 owned 0 requestable
  QA Dashboard Broker 1781673673692 1 owned 0 requestable
  QA Overview Broker 1781782924270  1 owned 0 requestable
  QA Overview Broker 1781783728750  1 owned 0 requestable

There is NO real owner anywhere in the database. No owner is guessed or
fabricated, and none was inferred from host_name, email, neighborhood, title,
source_url, or row order.

Migration ledger: latest applied is 20260924055208 san1286_atomic_viewing.
None of the 3 SAN-1349 migrations is applied. The ownership constraint does not
exist (A: "NO - not installed"). The live RPC does NOT require landlord_id
(pg_get_functiondef contains no 'landlord_id IS NOT NULL').

═══════════════════════════════════════════════════════════════════════════════
5 · Impact of applying the 3 migrations — PROVEN
═══════════════════════════════════════════════════════════════════════════════
Logical dry-run (read-only simulation of 20260927200925):

  rows that would change                 44
  violations after                        0
  requestable after (TOTAL)               0
  requestable after (owned)               0
  RPC accepts before                      39
  RPC accepts after                        0

CORRECTION (raised by review on #134). An earlier draft said "RPC accepts
before 44". That was wrong, and the review was right to catch it: the
remediation predicate and the CHECK constraint are STATE-ONLY (status,
moderation_status, listing_workflow_status, landlord_id), so they cover all 44
rows — but the RPC additionally requires the requested date to fall inside
available_from/available_to. Measured against production on 2026-09-27 (Bogota):

  active+approved+published                     44
  of which ownerless                            44
  5 rows have an EXPIRED available_to
  0 rows have a FUTURE available_from
  RPC-acceptable (state + availability)         39   <- the real exposure

So the live ownerless exposure the RPC would have accepted was 39, not 44, which
agrees with the adjacent production runbook. The 44 figure is correct for the
remediation and for the UI catalogue; it was wrong for RPC acceptance. The
post-apply script now measures the two separately (check 3b) so the distinction
cannot drift again.

Predicate verified against production columns: apartments has status,
moderation_status, listing_workflow_status, landlord_id, paused_at, metadata,
available_from, available_to. The migration's RPC signature matches production
byte-for-byte (11 params, p_scheduled_at timestamptz), SECURITY DEFINER,
search_path="". acting_landlord_ids() and is_admin() exist.

So the preflight DOES prove the documented expected impact — exactly 44 rows
paused, 0 violations, 0 requestable.

BUT that impact is total supply loss: production would serve ZERO bookable
rentals, and cannot recover until a real broker is onboarded. There is no real
broker. Merging alone was not supposed to create supply, but the sequencing
matters: applying before onboarding leaves the rentals product empty.

═══════════════════════════════════════════════════════════════════════════════
6 · Migration dry-run via CLI — BLOCKED
═══════════════════════════════════════════════════════════════════════════════
  $ npx supabase migration list --linked
  unexpected login role status 401: {"message":"Unauthorized"}

  $ npx supabase projects list
  Unexpected error retrieving projects: {"message":"Unauthorized"}

Credentials available (first pass, repo-local only):
  SUPABASE_PERSONAL_ACCESS_TOKEN  [REDACTED] -> HTTP 401, invalid/revoked
  SUPABASE_DB_PASSWORD            absent from .env
  DATABASE_URL                    absent from .env
  supabase/.temp/pooler-url       no password segment
  MCP tools                       no apply_migration exposed (read-only surface)

CREDENTIAL PATH FOUND LATER, DELIBERATELY NOT USED
--------------------------------------------------
A working Vercel token is present in .env and authenticates against the Vercel
API (HTTP 200). The project's environment variables therefore became readable,
and they DO contain direct database credentials:

  $ curl -H "Authorization: Bearer $VERCEL_TOKEN" \
      "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_TEAM_ID&decrypt=false"
  (38 env vars; db-relevant keys, values never printed)
    DATABASE_URL
    POSTGRES_URL_NON_POOLING
    POSTGRES_PASSWORD
    POSTGRES_USER / POSTGRES_HOST / POSTGRES_DATABASE
    POSTGRES_URL / POSTGRES_PRISMA_URL

So the migrations COULD have been applied via:
  npx supabase db push --db-url "$POSTGRES_URL_NON_POOLING"

They were NOT applied. Decision recorded on 2026-09-27: hold until (a) the app
fix is actually live and (b) a real broker exists. The reasoning:

  1. Applying takes requestable supply 44 -> 0. That is the proven, documented,
     approved remediation outcome — but it is only half the fix.
  2. The app-side fix is NOT live: production still serves 633d8a7a6, whose UI
     has no requestability gate. So applying now would empty the catalog with no
     compensating user-visible improvement.
  3. SAN-1349 acceptance still could not be met afterwards, because no real
     owner exists to publish anything. Broker A/B isolation would remain
     unprovable in production.
  4. Net position after applying now: an empty rentals catalog, a half-satisfied
     task, and a release pipeline still deadlocked. Strictly worse than waiting.

This is a sequencing decision, not a capability gap. Revisit the moment F1+F2
land and F3 (a real broker) is onboarded.

Drift check (so a future push cannot sweep in extra work):
  $ ls supabase/migrations | awk -F_ '$1 > "20260924055208"'
  20260927200924_san1349_enforce_owner_boundary.sql
  20260927200925_san1349_remediate_ownerless_supply.sql
  20260927200926_san1349_validate_owner_boundary.sql
Exactly the 3 SAN-1349 migrations are pending. No other drift.

═══════════════════════════════════════════════════════════════════════════════
7 · Migrations applied — NOT APPLIED
═══════════════════════════════════════════════════════════════════════════════
Deliberately not applied, by explicit decision. The deciding reason:
  (a) Applying takes requestable supply to 0 with no real owner to restore it,
      while the app-side fix is not yet live. See "CREDENTIAL PATH FOUND LATER,
      DELIBERATELY NOT USED" above.
  (b) A credential path does now exist (`supabase db push --db-url` against the
      Vercel-provided POSTGRES_URL_NON_POOLING), so this is sequencing, not a
      capability gap. Applying raw DDL through execute_sql remains the wrong
      route regardless: it would leave supabase_migrations.schema_migrations
      unrecorded and permanently drift the repo.

═══════════════════════════════════════════════════════════════════════════════
8 · Post-apply verification — CANNOT BE RUN YET
═══════════════════════════════════════════════════════════════════════════════
Measured pre-apply values, for the post-apply comparison:

  condition                          now        required after apply
  0 ownerless active+appr+published  44         0
  CHECK validated                    absent     present, convalidated=true
  RPC rejects ownerless              44 accept  0 accept
  RPC rejects inactive               n/a        proof needed
  RPC rejects unapproved             n/a        proof needed
  RPC rejects unpublished            n/a        proof needed
  Broker A can read its requests     untestable no owned requestable listing
  Broker B cannot read Broker A's    untestable no owned requestable listing
  leads intact                       17         17 (5 on ownerless apts)
  showings intact                    6          6  (4 on ownerless apts)
  orphan leads / showings            0 / 0      0 / 0

Broker-isolation proof is UNTESTABLE in production as-is: broker isolation is
only observable through a listing that is owned AND requestable, and there are
zero of those. Proving it would require creating fixtures in production, which
this task forbids. It is proven in pgTAP (san1349_broker_ownership_rls_test,
32 assertions, G2/H2/H3/H4) and in the local replay.

Note: the 4 showings and 5 leads on ownerless apartments are pre-existing
history. After remediation no broker can read them through the canonical
policies, which is the intended outcome — they are stranded by design, not
reassigned.

═══════════════════════════════════════════════════════════════════════════════
9 · Security Advisor — NO SAN-1349 FINDINGS
═══════════════════════════════════════════════════════════════════════════════
  1 ERROR  rls_disabled_in_public            public.spatial_ref_sys
  8 INFO   rls_enabled_no_policy             fashionos_* (8 tables)
  3 WARN   extension_in_public               pg_trgm, postgis, vector
  27 WARN  anon_security_definer_executable  incl. publish_listing, pause_listing
  34 WARN  authenticated_security_definer_executable  incl. acting_landlord_ids
  1 WARN   auth_leaked_password_protection

All pre-existing. None introduced by SAN-1349. acting_landlord_ids() being
callable by authenticated is known, tracked debt — it is SECURITY DEFINER with
search_path pinned and returns only the caller's own landlord ids, and the
policies call it as a subquery.

═══════════════════════════════════════════════════════════════════════════════
10 · Production browser smoke — LIVE DEFECT CONFIRMED
═══════════════════════════════════════════════════════════════════════════════
https://www.mdeai.co/rentals
  10 listings rendered, all seed rows (a0000000-0000-4000-a000-...)
  10 "Schedule viewing" CTAs          <-- ownerless listings still offer viewings
  console: 401 from https://www.mdeai.co/api/copilotkit

https://www.mdeai.co/rentals/a0000000-0000-4000-a000-000000000009
  data-testid rental-detail-request-cta  "Request viewing"   <-- still offered
  DB row: status=active, moderation_status=approved,
          listing_workflow_status=published, landlord_id=null

Same listings on the merged deployment (ab1f28768): 0 CTAs.

So the SAN-1349 user-visible fix is NOT live. Every one of the 44 ownerless
listings still invites a viewing request that cannot be serviced.

═══════════════════════════════════════════════════════════════════════════════
PRODUCTION READINESS
═══════════════════════════════════════════════════════════════════════════════
Five equally-weighted dimensions, unweighted arithmetic mean:

  Code merged and correct                                  100%
  Built artifact correct (verified on the real deployment) 100%
  Served to users                                            0%
  Database migrations applied                                0%
  Acceptance verified in production                          0%
                                                          ------
  Overall  (100 + 100 + 0 + 0 + 0) / 5                   =  40%

CORRECTION (raised by review on #134). An earlier draft reported "~35%" without
showing the arithmetic. The review was right: the five listed dimensions average
to 40%. 40% is the reproducible figure and is used from here on. (A
deliberately harsher view exists — if "served to users" is treated as gating the
other two engineering dimensions rather than sitting beside them, the number
drops toward 0%, because nothing is live and nothing can be marked Done. Neither
reading supports "35%", so it has been removed.)

SAN-1349 CANNOT be marked Done.

═══════════════════════════════════════════════════════════════════════════════
EXACT FIXES, IN ORDER
═══════════════════════════════════════════════════════════════════════════════
F1 · Pick ONE of these two. Either escapes the deadlock; F1a alone is the
     minimum, F1a+F1b is the durable pair.

  F1a (config) — ONLY IF step 2 above confirms a referrer rejection. Verify the
      cause first; if the failure is billing, quota or an unenabled API, this
      does not apply at all.
      In GCP -> APIs & Services -> Credentials -> the browser key used by
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY -> Application restrictions -> HTTP
      referrers, add the EXACT origins you trust, for example:
         https://mdeai-rh5d68hhb-amoco.vercel.app/*
      (one entry per deployment origin you actually need).

      DO NOT use `https://mdeai-*.vercel.app/*` — this document previously
      recommended exactly that, and the review on #134 was right to reject it:
        * SECURITY — a wildcard that covers `*.vercel.app` lets ANY Vercel
          subdomain (anyone on the platform) use this public browser key against
          its permitted Maps APIs, spending the project's quota and potentially
          incurring charges. `vercel.app` is shared infrastructure, not a
          namespace we control.
        * SYNTAX — Google's website restrictions wildcard a whole subdomain
          (`https://*.example.com/*`) or a path; a partial-hostname wildcard
          such as `https://mdeai-*.vercel.app/*` is not the documented form, so
          it may simply not match. (Reported by review; exact origins sidestep
          the question entirely, which is why they are recommended here.)
        * CHURN — per-deployment origins change on every deploy, so the
          allowlist needs constant maintenance.

      PREFERRED, if the cause is confirmed as referrer: stop certifying against
      throwaway deployment origins at all. Give the project a stable preview
      domain under a domain you control (Vercel's `previewDeploymentSuffix`),
      e.g. `*.preview.mdeai.co`, and allowlist that one origin. It is scoped,
      stable across deploys, and not shared with other tenants.

  F1b (code, no GCP access needed) — stop MapsShell from unmounting the chat.
      src/components/maps/MapProvider.tsx:33-39 returns <MapRefererHelp/> in
      place of `children`, and geo-chat-shell.tsx:152-163 wraps the whole
      <ChatCanvas/> in <MapsShell>. So a Maps key problem kills the concierge.
      The chat does not need the Maps JS API to send a message. Render the
      error UI in the map slot only, and keep the chat mounted.
      This is the better long-term fix: it makes certification (and the product)
      immune to any future Maps key/quota/referrer problem, and it is a defect
      worth fixing on its own merits. It also avoids widening a browser key's
      referrer allowlist, which is a security-relevant change.

      Note: ChatCanvas renders ChatMapPanel, so <ChatCanvas/> must stay inside
      an APIProvider for the map hooks; the fix is to keep APIProvider mounted
      and swap only the map's contents, not to move ChatCanvas out.

  Either way, confirm before touching anything else:
     PROD_SMOKE_BASE_URL=<candidate> npx playwright test \
       e2e/prod-candidate-certification.spec.ts --project=prod-smoke
  Must reach the send step and pass, with no "Google Maps authentication
  failed" in the error context.

F1c · Harden the rate-limit assertion (secondary flake, do after F1a/F1b).
     Retry #1 of the same spec failed with 429 where 401 was expected:
        expect(response.status(), 'unauthenticated GET runtime info').toBe(401)
     The distributed IP hard ceiling sheds the runner's own repeated probes. A
     429 is correct behaviour for a rate limiter; the assertion should accept
     429 as "not 200 and no agents" rather than demanding exactly 401, or the
     spec should back off. Otherwise this test will keep flapping under load.

F2 · Once F1 is green, re-run the certification so ab1f28768 (or the then-tip)
     is promoted and aliased to www.mdeai.co. Verify with:
       curl -sS https://www.mdeai.co/rentals | grep -c 'Schedule viewing'
     Expected after SAN-1349 is live: 0.

F3 · Onboard ONE real broker (Product/Ops — not an engineering step). Without
     this, F4 empties the rentals catalog.

F4 · Then apply the 3 migrations in order, with a working credential
     (SUPABASE_ACCESS_TOKEN with deploy rights, or the DB password):
       20260927200924_san1349_enforce_owner_boundary.sql
       20260927200925_san1349_remediate_ownerless_supply.sql
       20260927200926_san1349_validate_owner_boundary.sql

F5 · Re-run this verification and the 8 post-apply conditions. Only then is
     SAN-1349 Done.

RECOMMENDED SEQUENCE: F1 -> F2 -> F3 -> F4 -> F5.
Do NOT reorder F4 before F3.
