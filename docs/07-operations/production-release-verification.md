# Production release verification

Run this after every promotion to prove the live release identity and the host AI.

```bash
cd /home/sk/mdeai
set -a; . ./.env; . ./.env.local; set +a
npm run verify:production            # expects origin/main
npm run verify:production -- <sha>   # explicit merge SHA
```

It checks, in order:

1. The latest Vercel production deployment is `READY` at the expected commit.
2. `www.mdeai.co` resolves to that same deployment.
3. `/app` redirects to `/login?next=%2Fapp`; `/login` returns 200.
4. One real `hostOpsAgent` turn replies and persists a Mastra thread.
5. The disposable QA identity and its thread are deleted.

Exit code is non-zero on any mismatch or failed agent turn. It runs from the main checkout because that directory has `.vercel/project.json`; set `MDE_VERCEL_CWD` when running a branch worktree.

Prerequisites: Vercel CLI logged into the `amo-agency` team, Supabase service-role and public keys in `.env`/`.env.local`, and a Chrome binary (`MDE_E2E_CHROME_PATH`, default `/usr/bin/google-chrome`).

The script never prints secrets. The health spec is opt-in (`PROD_RELEASE_HEALTH=1`) and is excluded from normal local/CI runs.

## Recover a release blocked by GitHub Floor (SAN-1362)

**Use this when a new production *candidate* is staged but its exact-commit GitHub
`Floor` has failed, timed out, or is still pending.** Do not roll back a healthy
production site: a staged candidate has not reached users. The sole normal owner
of promotion is [Candidate Runtime Certification](../../.github/workflows/vercel-production-certification.yml).
That workflow checks the exact `main` push `Floor` run **after** candidate runtime
certification, **before** the final staged-state check and `vercel promote`.

### 1. Prove what is live and which commit is waiting

Run from an authenticated operator's checkout. These reads do not expose secrets.

```bash
git fetch origin main
SHA="$(git rev-parse origin/main)"
echo "Exact current main: $SHA"
curl -fsS https://www.mdeai.co/api/version
vercel api /v4/aliases/www.mdeai.co --raw --scope amo-agency | jq -er '.deploymentId'
vercel api /v4/aliases/mdeai.co --raw --scope amo-agency | jq -er '.deploymentId'
vercel api /v9/projects/prj_iadSvJDW4MBqtQ5s3YPlBNc08it6 --raw --scope amo-agency |
  jq -e '.autoAssignCustomDomains == false'
```

**STOP** if custom-domain auto-assignment is enabled, the two aliases differ, or
the current commit is not the intended candidate. Check Vercel deployment
`READY`, production target, branch `main`, commit SHA, and candidate ID.
Do not guess a candidate from the newest `READY` build. Keep the previous
working deployment on the public aliases during all diagnosis.

Find the **exact staged candidate ID** for this commit with a read-only Vercel
lookup (the filter checks the SHA again in the returned metadata):

```bash
vercel api "/v6/deployments?projectId=prj_iadSvJDW4MBqtQ5s3YPlBNc08it6&target=production&sha=${SHA}&limit=100" --raw --scope amo-agency |
  jq -er --arg sha "$SHA" '.deployments[] |
    select(.meta.githubCommitSha == $sha and .meta.githubCommitRef == "main" and .target == "production" and .state == "READY") |
    [.id, .url, .state, .meta.githubCommitSha] | @tsv'
```

If the query returns **no candidates**, stop rather than guessing. If it
returns **multiple deployments for the same SHA**, use the deployment ID from
the genuine Vercel `READY` event and certification run; do not select the
newest entry automatically. Confirm your chosen ID using
`vercel inspect <exact-staged-deployment-id> --scope amo-agency` and verify it is
`READY`, targets production and has the expected `main` commit.

### 2. Inspect the authoritative exact-SHA push workflow, not a status label

```bash
gh api "repos/amoai-tech/mdeai/actions/workflows/floor.yml/runs?head_sha=${SHA}&branch=main&event=push&per_page=100"   --jq '{count:.total_count,runs:[.workflow_runs[]|{id,head_sha,event,head_branch,status,conclusion,run_attempt,created_at,updated_at,html_url}]}'
gh run list -R amoai-tech/mdeai -w vercel-production-certification.yml -L 15
```

Require the exact SHA, `push` event, `main` branch, and latest attempt.
The controller fails closed if the Floor result is malformed or ambiguous.
A PR Floor, an unrelated green status, or a previous commit **does not count**.

- **Pending / in progress:** the candidate stays staged while `wait-floor`
  polls for about 20 minutes. Do not manually promote it.
- **Failure / cancelled / unknown:** open the matching run in GitHub Actions;
  inspect the specific failed job and fix its cause.
- **Timeout / GitHub API failure:** certification fails safely. A later green
  `Floor` result does not retroactively resume a completed failed run.

### 3. Correct and retry safely

**Actual code or test failure:** fix the source in a normal PR, merge into
`main`, and let the new real Vercel production candidate and its **new**
exact-SHA `Floor` pass through the existing pipeline.

**Transient runner/network failure, same SHA still intended:**

```bash
# Replace with the real exact-SHA Floor run ID found in step 2.
gh run view <floor-run-id> -R amoai-tech/mdeai --log-failed
gh run rerun <floor-run-id> -R amoai-tech/mdeai --failed
gh run watch <floor-run-id> -R amoai-tech/mdeai
```

GitHub reruns preserve the original event commit/ref. A certification
job **still waiting on a pending Floor** can observe the successful run.
An already **failed Floor stops certification immediately**, so rerunning
Floor cannot revive that failed certification. Likewise, if certification
has **ended or timed out**, rerunning Floor does **not** restart it.

**Before redeploying**, wait for `gh run watch` to finish and recheck step 2:
the latest exact-SHA `main` push Floor attempt must be `completed` with
`conclusion=success`. If it is still running, failed, cancelled or unknown,
**do not redeploy**. Confirm `main` still points to `$SHA`.

Only then may an authorized operator create a fresh genuine Vercel production
redeployment of that exact commit, with auto-assign still **OFF**, using the
Vercel dashboard's
**Redeploy** action (or `vercel redeploy <exact-staged-deployment-id>
--scope amo-agency`). This **rebuilds**, so it requires the complete new
candidate certification and new domain checks. Verify the new deployment's
SHA, target and `READY` event; if redeploy is refused or dispatch is
missing, stop and investigate. Never fabricate a GitHub
`repository_dispatch` READY payload, change the status manually, or
run `vercel promote` to skip certification.

### 4. Prove recovery completed

```bash
gh run list -R amoai-tech/mdeai -w vercel-production-certification.yml -L 15
gh api "repos/amoai-tech/mdeai/commits/${SHA}/status"   --jq '[.statuses[] | select(.context == "production-certification") | {state,description,target_url}]'
curl -fsS https://www.mdeai.co/api/version
curl -fsSL https://mdeai.co/api/version
vercel api /v4/aliases/www.mdeai.co --raw --scope amo-agency | jq -er '.deploymentId'
vercel api /v4/aliases/mdeai.co --raw --scope amo-agency | jq -er '.deploymentId'
```

Accept recovery only when the successful certification run shows:
candidate runtime PASS → exact-SHA Floor PASS → final staged PASS →
promotion of that **same** deployment → both aliases match → full
three-minute stability PASS → published `production-certification=success`.
Also check that the live `/api/version` SHA matches the certified candidate.
Record the run IDs, timestamps, candidate deployment ID and SHA in the
**existing** Linear release task; do not create a second release engine.

**If a bad version is already live**, use the separate
[production rollback runbook](production-rollback-runbook.md) instead of
this staged-candidate recovery procedure.

### References

- [GitHub: re-run workflows and failed jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
- [Vercel: redeploy an existing deployment](https://vercel.com/docs/cli/redeploy)
- [Vercel: staged production promotion](https://vercel.com/docs/deployments/promoting-a-deployment)
