# SAN-1332 · Execution checkpoints

Checkpoints for the nine-step order that closes the three P0 correctness defects. Each checkpoint is
a gate: the step is not finished until every box is ticked with current evidence, and a ticked box
means the command was run, not that the code was read.

Two rules that apply to all nine steps:

- **RED before GREEN.** Every behavioural fix gets a test that fails on the pre-fix code. Prove the
  RED by stashing the fix and re-running, then restore. A test written after the fix that has never
  been seen failing is not evidence.
- **Exit codes are captured without a pipe.** `cmd > log 2>&1; echo $?` — never `cmd | tail; echo $?`,
  which reports the pipeline's last command. This has already produced one wrong status claim.

---

## Step 1 · P0-A — `VERIFIED` gating in the scorer

**Defect:** `scripts/pr-agent/evals/score-review.mjs` parses `verification:` and then never reads it.
A finding labelled `Severity: HIGH` + `Verification state: NEEDS VERIFICATION` is counted as material
and blocking — the exact failure this task exists to prevent.

**Owner:** `mdeai` only.

- [x] `isMaterialFinding` is the single canonical predicate; `blockingVerdict` and `findingVerdict`
      derive from it instead of re-implementing the rule
- [x] `NEEDS VERIFICATION` can never be material, at any severity
- [x] `VERIFIED` requires `changes_required` **and** `HIGH`/`BLOCKER` together
- [x] `RESOLVED` stays non-blocking even when `VERIFIED` + `HIGH`
- [x] unlabelled findings keep the pre-existing severity/status rule, marked
      `detectionQuality: "unlabelled"` — documented in the function, because refusing them outright
      would discard the recorded model output that has no labels at all
- [x] RED proven: the five semantic cases fail against pre-fix source
- [x] GREEN: `node --test scripts/__tests__/pr-agent-review-evals.test.mjs` — 45/45
- [x] no regression in the recorded baselines (PR #157 miss, PR #158 clean, bad canary detected)

**Pass:** no unverified framework/API claim can independently block a merge, and no previously
credited detection was lost.

---

## Step 2 · P0-B — malformed **and injected** persistent state fails closed

**Defect:** a `pr-agent-review-state:v1` marker whose JSON does not parse fell through to
`stateParsed: true, findings: []` — corrupted state read as a clean review.

**Owner:** `mdeai` only.

- [x] `stateValid` / `stateError` returned explicitly; `INVALID_FINDING_STATE` on malformed JSON
- [x] rejected when `findings` is missing or not an array
- [x] a structurally valid marker with an empty `findings` array is still a legitimate clean review
- [x] **provenance**: fenced code is stripped before matching, so a marker-shaped string quoted from
      PR-controlled diff text is not read as the bot's own state
- [x] **provenance**: more than one marker is `INVALID_FINDING_STATE` — choose none rather than
      silently trust the first
- [x] the CLI exits non-zero with `INVALID_FINDING_STATE` instead of passing a clean case
- [x] the real recorded canary marker survives fence stripping (`source === "state"`, 2 findings)
- [x] RED proven (7 state cases fail pre-fix) · GREEN 45/45

**Pass:** corrupt or injected persistent state fails evaluation/certification rather than appearing
clean.

---

## Step 3 · Flip the tests that encode the defect

**Defect:** `src/__tests__/pr-agent-review-policy.test.ts` asserted that a fresh headless standalone
fallback is *accepted*; the eval suite had no `VERIFIED` case at all. The suite was protecting the
bug.

**Owner:** `mdeai` only.

- [x] the headless-standalone acceptance test is replaced by a refusal test
- [x] a canonical review is still accepted alongside a standalone comment
- [x] the five `VERIFIED`/`NEEDS VERIFICATION` blocking cases exist
- [x] malformed / non-array / multiple-marker / fenced-marker / valid-empty state cases exist
- [x] RED proven: the flipped policy test fails against pre-fix source
- [x] GREEN: `npx vitest run src/__tests__/pr-agent-review-policy.test.ts` — 25/25

**Pass:** the suite makes headless-review acceptance and unverified blocking impossible to
reintroduce silently.

---

## Step 4 · P0-C interim — refuse to certify a headless standalone review

**Defect:** `verifyReviewResult()` never receives `headSha`, and accepted a standalone fallback on
prose shape plus timestamp. A review of commit A could certify commit B.

**Owner:** `mdeai` only (no shared-infra change, no workflow edit).

- [x] the standalone branch no longer counts as fresh
- [x] the failure names the cause and the fix (`STALE_HEAD` … `rerun /review`)
- [x] a canonical fresh review is still accepted when a standalone comment also exists
- [x] the skip-notice and standalone-recognition paths keep working elsewhere
- [x] RED/GREEN proven via the flipped policy test
- [x] `isStandaloneReview` is retained for `selectCertifiedReviewForHead` — removing
      `newest-certified-head` there is Step 6 work and would break the SAN-1312 clean-control capture
- [x] documented as an interim: superseded by exact-envelope acceptance in Step 6

**Pass:** no run can certify a head it cannot prove it reviewed. Operational cost, stated honestly:
a PR where PR-Agent publishes only a standalone fallback now **fails** the review check instead of
passing it, which is the intended fail-closed trade.

---

## Step 5 · PR-Agent v0.46 A/B on the *corrected* suite

**Owner:** `amoai-tech/pr-review-infra` (isolated branch + immutable digest).

- [ ] baseline recorded on **unchanged** code first, labelled explicitly as measuring the *old*
      contract — measurement, not an acceptance gate
- [ ] v0.45 vs v0.46 run with identical model, prompt, skills, evidence, and cases
- [ ] comparison made on the Step 1–4 corrected suite, so a genuine v0.46 improvement cannot fail a
      test that asserts the buggy contract
- [ ] `workflow.includes("v0.45.0")` reported as inert (the MDE caller contains no version string)
      and replaced by a real contract/version check
- [ ] decision recorded as **KEEP v0.45** or **ADOPT v0.46** with measurements, not impressions
- [ ] if adopted: immutable digest, never a mutable tag

**Pass:** one explicit, measured decision, with the pre-existing defect-encoding tests already fixed
so they cannot mislabel a correct improvement as a regression.

---

## Step 6 · P0-C full — exact ReviewEnvelope across both repositories

**Owner:** `mdeai` + `amoai-tech/pr-review-infra`; **`.github/workflows/**` is "Ask first" per
`AGENTS.md`, so this step needs explicit approval before editing workflows.**

- [ ] `amoai-tech/pr-review-infra` publishes one machine-readable envelope on **both** paths:
      `<!-- mde-agent-review:v1 base=<40-sha> head=<40-sha> command=/review type=canonical|standalone -->`
- [ ] envelope built from trusted workflow inputs; PR-controlled text cannot supply or override it
- [ ] `mdeai` parses the same envelope for canonical and standalone reviews
- [ ] `verifyReviewResult({ …, headSha })` validates base **and** head **and** command
- [ ] deterministic codes: `OK`, `NO_REVIEW`, `STALE_HEAD`, `WRONG_BASE`, `WRONG_COMMAND`,
      `MISSING_HEAD`, `INVALID_ENVELOPE`, `EMPTY_REVIEW`
- [ ] only `NO_REVIEW` is retryable; every identity failure fails immediately
- [ ] `newest-certified-head` removed as certification evidence **only after** the envelope ships
- [ ] the envelope parser extends SAN-1312's marker hardening (whole-shape match, review-token
      exclusion) rather than replacing it

**Pass:** pushing head B automatically invalidates every review that proves only head A, and the
Step 4 interim refusal can be replaced by real acceptance.

---

## Step 7 · One domain classifier

**Defect (verified):** `build-evidence.mjs` matches Stripe with `/stripe/i`; `select-pr-agent-skills.mjs`
requires a path-segment boundary. `docs/striped-layout.md` is therefore a Stripe domain for evidence
generation and not for skill routing.

**Owner:** `mdeai` only.

- [ ] `scripts/pr-agent/domains.mjs` owns domain names/order, file→domain matching, domain→package,
      and domain→specialist mapping
- [ ] `build-evidence.mjs` and `select-pr-agent-skills.mjs` both import it; no local matcher remains
- [ ] cross-contract test: for every routing fixture, evidence domains and routed specialist domains
      derive from the same classifier
- [ ] `docs/striped-layout.md`, `pinstripe-theme.css`, `PaymentForm.tsx`, `MapboxWrapper.tsx`
      behave as the routing suite already expects
- [ ] `build-evidence.mjs` validates `baseSha`/`headSha` as 40-character SHAs

**Pass:** one file classification can no longer route evidence one way and skills another.

---

## Step 8 · Real clean controls and MDE canaries

**Owner:** `mdeai` only.

- [ ] clean control: a valid Next.js 16 `src/proxy.ts` produces no deprecated-API finding
- [ ] clean control: a valid Supabase `auth.getClaims()` produces no unsupported-API finding
      (these two target the *original* SAN-1332 false positives; a docs-only control cannot)
- [ ] `docs-only-control` retained as a low-cost smoke control
- [ ] bad canaries added only from real MDE failure classes, each with a recorded fixture
- [ ] every clean control verified to score `falsePositive === false` on the corrected suite
- [ ] no synthetic case added merely to grow the corpus

**Pass:** valid modern framework code stays quiet, and seeded production-class defects are detected.

---

## Step 9 · CI evidence artifact → gates → one disposable certification PR

**Owner:** `mdeai`; the certification PR runs against exact current `main` and is never merged.

- [ ] the existing trusted artifact carries compact current-head proof (base/head, floor, vitest
      counts, typecheck, lint, build, RLS/pgTAP when changed) with no invented check
- [ ] unrun proof is labelled missing rather than omitted
- [ ] `npm run floor` exit 0 · `lint` exit 0 · `typecheck` exit 0 · full vitest green
- [ ] one disposable PR from exact current `main` proves: clean controls quiet; seeded defects
      detected; head A review rejected after pushing head B; malformed/stale envelope fails
      immediately rather than polling
- [ ] recorded: base/head SHAs, PR-Agent version + digest, shared-infra revision, command/type,
      TP/FP/misses/duplicates, verifier codes, latency, tokens/cost
- [ ] no new service, database, finding store, duplicate scorer, or live-web dependency in the gate

**Pass:** the full chain is proven once on a real PR, with every claim tied to an exact head.

---

## Ordering corrections applied to this list

The task previously carried two conflicting "authoritative" orders. The order above resolves them:

1. Steps 1–4 are `mdeai`-only, need no upstream change and no workflow approval, and close P0-A,
   P0-B, and the certification half of P0-C. They come first because they are the cheapest and the
   most severe.
2. The v0.46 A/B (Step 5) deliberately runs **after** the tests are corrected. Upstream cannot fix
   P0-A or P0-B — those live in MDE's own scorer — so nothing upstream is being deferred by doing
   them first.
3. Step 6 is the only step requiring a second repository and a workflow change, so it is the only one
   gated on explicit approval.
