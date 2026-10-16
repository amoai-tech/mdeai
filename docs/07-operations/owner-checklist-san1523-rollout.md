# Owner checklist — turning on semantic search

For: the business owner. Tasks: SAN-1523 · MDE AI — Process Embedding Jobs Reliably and Keep Semantic Search Current, and SAN-1502 · MDE Rentals — Enable Full Development Journeys and Defer Real-World Approval Gates.

Status when written (2026-10-16): all code is finished and tested. **Nothing has been applied to production.** Every step below that touches production needs your go-ahead, one step at a time. Never paste a password, key or secret into chat, tickets or logs.

Full technical steps: `docs/07-operations/san1523-embedding-worker-rollout-runbook.md`, in the same folder.

## What you get at the end
A visitor searching "quiet apartment near a park" finds development listings by meaning, not only by keywords. Today 0 of ~97 listings have the search fingerprint that makes this work.

## A. Do now (nothing touches production)

- [ ] **1. Rotate the database password.** It was printed once by mistake in an earlier session. Supabase dashboard, project `zkwcbyxiwklihegjhuql`, Settings, Database, reset password. Put the new value only in your password manager, then update `SUPABASE_DB_URL` wherever you keep it. *Stop if:* you are unsure where the old password is still used. Ask me to list the places before you rotate.
- [ ] **2. Get one reviewer to approve the pull requests in one sitting.** Order, small to large:
  - [x] #356, audit identity (listings cannot fake "who approved me"): merged 2026-10-16
  - [ ] #352, development search visibility (three small database rules, including: visitors keep read access only on the three search-fingerprint tables)
  - [ ] #357, event cards show city and map pin
  - [ ] #341, the embedding worker. Reviewer reads the 388-line migration with the guide: https://github.com/amoai-tech/mdeai/pull/341#issuecomment-6219327593
  - The required check is `floor`, already green. Codacy and `verify-review-result` are known false alarms and do not block.
- [x] **3. #345 (restaurant vote) is merged** (2026-10-16). Production already had its database change; its file is now on `main`, so the history check can pass.

## B. Production steps (each one needs your explicit go-ahead)

Run from an up-to-date `main` after the pull requests above are merged.

- [ ] **4. Apply #352 and #356 together, first** (#356 is already on `main`; #352 must merge before this step). Their version numbers are older than #341's, so they must go before it (otherwise `db push` refuses). The dry run must list exactly four files: `20261016233000`, `20261016234000`, `20261016235000`, `20261016235500`. *Stop if:* anything else is listed.
- [ ] **5. Put the two secrets in place, in your own terminal.** The worker password (`EMBEDDING_CRON_SECRET`, generated with `openssl rand -hex 32`) and the Google key (`GOOGLE_GENERATIVE_AI_API_KEY`). Commands are in runbook section 5. I never see these values.
- [ ] **6. Apply #341.** The dry run must list `20261017010000_embedding_worker_pipeline.sql`, plus `20261017020000_san1305_restore_fts_hybrid_search.sql` if #361 has merged. Nothing else. Then run the read-only checks in runbook section 4.1.
- [ ] **7. Deploy the worker** with `--no-verify-jwt`, then the two smoke tests: GET must answer 405 and POST without the secret must answer 401.
- [ ] **8. Process 1 listing, check it, then 5.** Required: HTTP 200, `failed` is 0, vectors are 768 numbers long, no listing handled twice. *Stop on any 502, 503, or a listing stuck in `processing` for more than 6 minutes.* Stopping is safe: with no schedule, the queue just waits.

## C. After the worker is proven (I build these; you approve)

- [ ] **9. Reconnect semantic search in development** (`intelligence-rental-search.ts`), then prove a search that keywords alone would miss.
- [ ] **10. The schedule (PR 2)** so new listings are indexed automatically. Success means the timer ran, the call returned 2xx, and jobs reached `done`.
- [ ] **11. Small fixes in one pull request:** key sent as a header, "Price unavailable" instead of "Free", retry shorter text.

## Optional, with your OK
- [ ] **Read-only production check** of the queue (97 pending?), vector sizes, and whether any existing listing has forged approval fields. Reads only, in a read-only session.

## If something goes wrong
- The migrations only add things; fix forward with a new migration, never edit an applied one.
- To make the worker unreachable: `npx supabase secrets unset EMBEDDING_CRON_SECRET --project-ref zkwcbyxiwklihegjhuql`.
- Bad vector: editing the listing queues a fresh one automatically.
