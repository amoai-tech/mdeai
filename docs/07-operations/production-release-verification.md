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

Prerequisites: Vercel CLI logged into the `amoco` team, Supabase service-role and public keys in `.env`/`.env.local`, and a Chrome binary (`MDE_E2E_CHROME_PATH`, default `/usr/bin/google-chrome`).

The script never prints secrets. The health spec is opt-in (`PROD_RELEASE_HEALTH=1`) and is excluded from normal local/CI runs.
