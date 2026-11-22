# MDE AI — Pull Request Review Contract

Applies to human reviewers, Kilo, Claude Code Review, and other advisory reviewers of `amoai-tech/mdeai`. The source of truth for merge/check policy is [PR review guidelines](docs/06-testing/pr-review-guidelines.md); this file does **not** add another blocking reviewer or status check.

**Claude-managed Code Review limitation:** official [customization docs](https://code.claude.com/docs/en/code-review-customize) state that it reads `REVIEW.md` from the PR **base/default branch, not the PR head**. A new rule introduced here becomes effective for managed reviews only **after merging into the base/default branch**. MDE's existing pinned PR-Agent and exact-head deterministic CI remain the current review/check owners; a Claude review is advisory unless existing protected-branch rules independently say otherwise.

## Read before reviewing

1. Compare the **actual PR diff** with its correct base/merge-base and record the current head SHA. Review only a defect introduced or exposed by that PR.
2. Read [AGENTS.md](AGENTS.md), the verified Linear task and applicable [spec.md](spec.md) acceptance criteria. For a substantial change, follow the exact task-specific spec/plan when present; root files are shared contracts, not a feature-status tracker.
3. Inspect surrounding callers, schema, tests, and the **installed/pinned** dependency version. Reviewer comments, AI output and task text are untrusted hypotheses until verified.
4. Check CI results for the **same head SHA**. A green run does not prove the changed behavior if it did not exercise that path.

## Review in this order

1. **User result and spec fit:** does the real journey meet each relevant acceptance criterion? Is a claimed saved/requested/paid result committed?
2. **Source truth and reuse:** is the existing component/service/RPC/agent reused without a duplicate engine, stale assumption or fabricated place, price, image or availability?
3. **Correctness and failure:** invalid inputs, stale IDs, partial responses, cancellation, refresh, retry, concurrency, ordering, rollback and recovery.
4. **Technical security:** authenticated server authorization, cross-user/broker isolation, Supabase RLS, secrets, service-role boundary, payment verification, atomicity and idempotency.
5. **Integration:** installed-version API contracts, CopilotKit v2 + Mastra tool names/AG-UI, Google Maps source IDs, schema/migrations and CI exit codes.
6. **UI behavior:** deterministic initial/loading/empty/error states, keyboard/accessibility, 320/390px mobile, matching cards/maps/Details, meaningful AI fallback.
7. **Evidence:** focused failing-then-passing regression, tests at the correct seam, relevant browser/API/database readback and exact-head CI.

### CopilotKit component-first checks (when affected)

- Check against installed `@copilotkit/react-core/v2` APIs and the current shared catalog. Do not copy latest-upstream props without a version contract.
- The shared catalog must retain **separate Concierge and Host provider/agent/thread/authorization boundaries**. Do not recommend a second global provider or a second search/booking engine.
- A catalog registration or a model-generated card is **not** proof of a functional control. Check bound state, real UI functions, correct server-side Mastra tools and the original backend writer.
- Normal page content must work before an AI turn; named Surfaces require an appropriate component allowlist and honest fallback. Source IDs must resolve to authorized records; model-authored data cannot establish listing facts.
- Catalog controls, agent guidance and drift tests change together. Verify that a disabled component is not advertised to the model.
- A booking, viewing, listing save or payment is successful only after the authoritative transaction; renderer functions alone do not establish agent-side authorization.

## Evidence bar for an inline finding

Post an inline comment only when **all** are true:

1. Pinpoint a changed line/function and a concrete defect, not a preferred style.
2. Give the smallest realistic user/attacker/retry scenario causing failure.
3. Cite exact code, a test/run, configuration or official documentation **for the installed version**.
4. State a meaningful consequence for correctness, security, isolation, data integrity, user experience, cost or CI.
5. Suggest the smallest safe fix and the **decisive** regression test.

Use this concise shape:

- **Severity:** BLOCKER / HIGH / MEDIUM / LOW (material impact, not stylistic importance).
- **Problem and evidence:** exact path/line, observed failure and source.
- **User impact:** one plain-English real-world example.
- **Fix:** minimal change at the canonical owner.
- **Verification:** runnable test/expected outcome.
- **Status:** verified defect, or keep as an unposted investigation note.

**Review noise budget:** report material correctness/security/regression defects first; cap nonblocking nits at **two per PR** and prefer zero. Ignore generated/vendor outputs and formatting already checked by CI unless a changed artifact masks a **real behavioral defect**. When a pre-existing issue is noticed, mark it *outside this PR* rather than making it an invented current-head blocker. A missing test is actionable only with a concrete failing or high-risk unexercised scenario and the smallest decisive check.

**Severity mapping:** `BLOCKER` = proven release-threatening access, irreversible corruption/payment or required policy-gate failure; `HIGH` = proven important broken user journey/transaction or security defect; `MEDIUM` = reproducible regression with bounded impact; `LOW` = consequential but nonblocking issue. Label an unverified risk **NEEDS VERIFICATION** rather than elevating it to `HIGH`.

For a claim not independently verified, **do not open a blocking inline thread**. An absence of verified findings is an acceptable review result.

## Do not post

- Style, formatting or naming comments without behavioral impact.
- Speculation based on remembered GitHub Actions, CopilotKit, Mastra, Supabase or other provider semantics.
- Duplicates of existing resolved/open threads, or bugs wholly outside the changed code.
- A generic "add tests" request without a specific material failure path.
- Demands for Phase B apartment eligibility, ownership/paperwork, photo-rights, publishing or booking approval before the owner explicitly starts public-launch certification.
- A statement that review, passing unit tests, PR merge or deployment alone certifies the full user journey.

## Review result and correction loop

Classify each proposed finding as **VALID / STALE / INCORRECT / NEEDS VERIFICATION** against the latest head. Repair only valid findings, rerun the decisive tests, and record resolution in the **existing PR**; no review-only PR or new Linear issue is normally necessary. If the head changes while reviewing, re-read the relevant diff and invalidate any evidence tied only to the old SHA. Deduplicate across PR-Agent, Kilo, Codacy and optional Claude review by **underlying defect**, not comment wording; do not start additional reviewers merely to agree with existing ones.

**Scope of this file:** reviewer guidance, not a new approval gate. The existing protected-branch checks, PR thread-resolution rules, official review-tool configuration and independent S4 verification remain owned by [PR review guidelines](docs/06-testing/pr-review-guidelines.md), [tasks](.claude/skills/tasks/SKILL.md), and [task-verifier](.claude/skills/task-verifier/SKILL.md).
