# OpenMuse · OpenDots · OpenBot upstream reference updates (SAN-1551)

These are optional **source references**, not package dependencies or installed MDE subsystems. Current MDE remains Next.js → CopilotKit v2 → Mastra → Supabase, with existing product APIs and authorization. No business approval or verification prerequisites are introduced for Phase A.

- [OpenMuse](https://github.com/CopilotKit/openmuse): **MODEL** chat, streaming progress, sourced cards and mobile patterns. Owner: [SAN-1554](https://linear.app/amo100/issue/SAN-1554).
- [OpenDots](https://github.com/CopilotKit/OpenDots): **ADAPT** draft-aware review, change/conflict detection and receipt recovery in the existing MDE write path. Owner: [SAN-1555](https://linear.app/amo100/issue/SAN-1555); shared contract: [SAN-1548](https://linear.app/amo100/issue/SAN-1548).
- [OpenBot](https://github.com/CopilotKit/openbot): **REFERENCE ONLY** unless a proven external computer/browser use case justifies a separately deployed service. Owner: [SAN-1324](https://linear.app/amo100/issue/SAN-1324), followed by SAN-1325. The recorded v0.0.14 commit is an **unverified implementation baseline**, not evidence the release was installed or works. Do not silently switch to newer releases.

## Existing maintenance workflow

The repository already runs `.github/workflows/skill-upstream-maintenance.yml` weekly and on manual dispatch. The same workflow runs `node scripts/check-ai-reference-upstreams.mjs` against `reference-upstreams.json` in a separate `ai-reference-upstreams` job from the strict vendored-skill job. It compares each pinned **reference commit** to upstream HEAD, writes a job summary, and annotates changed/unavailable sources. Keeping the jobs separate prevents an unrelated vendored-skill failure from hiding the AI-reference result.

For a local read-only check:

```bash
node scripts/check-ai-reference-upstreams.mjs --json
node --test scripts/__tests__/ai-reference-upstreams.test.mjs
```

A `DRIFT` status means "consider upstream changes", **not** "upgrade now". An `UPSTREAM_UNAVAILABLE` status means no conclusion; HTTP failures carry `HTTP_<status>`, malformed responses carry `MALFORMED_RESPONSE`, and timeouts are unavailable rather than drift. Neither status fails an application PR or causes an automated merge. Manifest errors still fail to prevent silent loss of tracking. Each entry is checked against its expected GitHub owner/repository, and each summary row includes a release or compare link plus the manual decision: adapt, defer or ignore. In `--json` mode stdout stays valid JSON; warnings go to stderr. The separate vendored-skill integrity gate retains its original strict policy.

## Safe update procedure

1. Read the compare link in the weekly GitHub Actions summary and latest release notes. Verify the full upstream commit/tag rather than trusting a floating version.
2. Identify concrete MDE improvements and record **source path → MODEL / ADAPT / REFERENCE ONLY → MDE destination → focused test** in the existing owner's Linear task. Record the completed decision as `adapt`, `defer` or `ignore` so a weekly warning is not left undecided. If nothing useful changed, leave the reference pin unchanged and record the decision.
3. Make changes only to existing MDE UI/contracts/tools. No new chat runtime, page database, search engine, approval store, or booking path. For OpenBot, separately prove the official pinned release in isolation before any MDE link.
4. Run focused tests, authorization/RLS/replay tests if applicable, `npm run floor` when required, and signed-in/mobile journeys for user-visible changes.
5. Update the pinned full SHA and review evidence **only after inspection**. Updating this manifest is not a substitute for proof that a feature works in MDE.

This tracking is a developer convenience, not Phase B public-launch certification.
