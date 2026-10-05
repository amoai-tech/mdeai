---
title: Production rollback runbook
description: How an operator confirms production is really broken, puts the previous working release back, and proves it worked, without undoing the staged-release protection.
status: current
updated: 2026-10-05
source_of_truth: scripts/vercel-release-control.mjs, .github/workflows/vercel-production-certification.yml, Vercel docs (Instant Rollback, vercel rollback)
---

# Production rollback runbook (SAN-1403)

Use this when a release has gone live on `www.mdeai.co` and customers are hurt: for example the map shows no pins, or chat fails. Releases are certified before they go live (SAN-1330), so this is the rare case where a certified release is still bad in a way the tests could not see.

Run the commands from the linked checkout (the repo root with `.vercel/project.json`), logged in to the `amoco` team. Print no tokens, cookies or environment values.

## 0. Is production really broken? Decide before touching anything

**Do not roll back because an alarm says "promotion verification failed".** On 2026-10-05 production was healthy and the verifier itself was wrong (fixed in PR #201). Check the facts first:

```bash
vercel api /v4/aliases/www.mdeai.co --raw    # deploymentId = what customers get now
vercel api /v4/aliases/mdeai.co --raw        # must match www
```

Then run the existing smoke (GitHub: Actions, Production Runtime Smoke, Run workflow) and look at the logs for the serving deployment:

```bash
vercel logs <deployment-id> --level error --since 30m --no-follow
```

Roll back only if production is confirmed unhealthy, or a domain points at a deployment nobody intended. If production is healthy and only a check is red, fix the check and stop here.

## 1. Find the previous healthy deployment

The certification run logs the version to recover to: look for the line `production currently serves dpl_...` in the "Confirm the candidate is staged" step of the release run (GitHub Actions, Candidate Runtime Certification). If that is not available:

```bash
vercel ls --prod --scope amoco
```

Pick the newest READY production deployment that served customers before the bad one. Only deployments that previously held the production domains can be rolled back to.

## 2. Put it back: Instant Rollback

```bash
vercel rollback <exact-previous-deployment-id> --yes --scope amoco
vercel rollback status --scope amoco
```

`rollback` is the recovery path. `vercel promote` is for staged candidates becoming current, and is **not** how an old live version is restored.

## 3. Prove it worked

```bash
vercel api /v4/aliases/www.mdeai.co --raw    # deploymentId must equal the id you rolled back to
vercel api /v4/aliases/mdeai.co --raw        # same id
```

Run Production Runtime Smoke again and confirm it passes. Record in Linear: the bad deployment id, the id restored, the time, and why.

## 4. Two traps to avoid

**Auto-assign must stay OFF.** After a rollback Vercel turns automatic production-domain assignment off. If you later undo the rollback with `vercel promote`, Vercel turns it back **on**, which would let the next untested build reach customers. MDE needs it off. After any recovery or roll-forward, check it before the next release:

```bash
vercel api /v9/projects/prj_5eY5DdiVxn7hDbruTG7BrrQT1QAB --raw | jq '.autoAssignCustomDomains'   # must print false
```

If it prints `true`, switch off "Auto-assign Custom Production Domains" (Vercel project, Settings, Environments, Production, Branch Tracking). The release pipeline also refuses to certify while it is on.

**A rollback only changes the app version.** It does not undo database changes, third-party API changes or environment variable changes (Vercel restores the earlier build with its earlier environment). If the bad release also changed the database, the old app may still fail: check that before declaring recovery.

## 5. After recovery

- Do not re-run certification for an already-promoted deployment; the staged check refuses it on purpose.
- Merge the fix as a normal release. It goes through staging, certification and promotion like any other.
- Add the lesson to the Linear task for the bad release.

## Sources

- https://vercel.com/docs/instant-rollback (rollback behaviour, auto-assign off after rollback, undo with promote turns it on)
- https://vercel.com/docs/cli/rollback and `vercel rollback --help` on the pinned CLI 59.25.4 (`--yes`, `--timeout`, `status`)
- https://vercel.com/docs/deployments/promoting-a-deployment (staged production deployments)
