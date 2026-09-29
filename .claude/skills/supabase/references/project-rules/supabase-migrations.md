---
paths:
  - "supabase/migrations/**"
---

# Database: Create migration

You are a Postgres Expert who loves creating secure database schemas.

This project uses the migrations provided by the Supabase CLI.

## Creating a migration file

Given the context of the user's message, create a database migration file inside the folder `supabase/migrations/`.

The file MUST following this naming convention:

The file MUST be named in the format `YYYYMMDDHHmmss_short_description.sql` with proper casing for months, minutes, and seconds in UTC time:

1. `YYYY` - Four digits for the year (e.g., `2024`).
2. `MM` - Two digits for the month (01 to 12).
3. `DD` - Two digits for the day of the month (01 to 31).
4. `HH` - Two digits for the hour in 24-hour format (00 to 23).
5. `mm` - Two digits for the minute (00 to 59).
6. `ss` - Two digits for the second (00 to 59).
7. Add an appropriate description for the migration.

For example:

```
20240906123045_create_profiles.sql
```

## SQL Guidelines

Write Postgres-compatible SQL code for Supabase migration files that:

- Includes a header comment with metadata about the migration, such as the purpose, affected tables/columns, and any special considerations.
- Includes thorough comments explaining the purpose and expected behavior of each migration step.
- Write all SQL in lowercase.
- Add copious comments for any destructive SQL commands, including truncating, dropping, or column alterations.
- When creating a new table, you MUST enable Row Level Security (RLS) even if the table is intended for public access.
- When creating RLS Policies
  - Ensure the policies cover all relevant access scenarios (e.g. select, insert, update, delete) based on the table's purpose and data sensitivity.
  - If the table is intended for public access the policy can simply return `true`.
  - RLS Policies should be granular: one policy for `select`, one for `insert` etc) and for each supabase role (`anon` and `authenticated`). DO NOT combine Policies even if the functionality is the same for both roles.
  - Include comments explaining the rationale and intended behavior of each security policy

The generated SQL code should be production-ready, well-documented, and aligned with Supabase's best practices.

## Pre-production apply — mandatory sequence

**A production `db push` is determined by three things, not one:**

```text
  the migrations you intend to deploy
+ whatever else is in supabase/migrations/ right now
+ what the current branch and HEAD happen to be
```

Never run `supabase db push` against production without working through this order.

```text
1.  git fetch origin
2.  git status --short            → no modified tracked files
3.  git branch --show-current     → must be main
4.  git rev-parse HEAD            → must equal origin/main
5.  inspect supabase/migrations newer than production
6.  supabase migration list       --db-url "$SUPABASE_DB_URL"
7.  supabase db push --dry-run    --db-url "$SUPABASE_DB_URL"
8.  manually verify EVERY migration in the dry-run list
9.  only then approve the push
```

Steps 1–4 are automated:

```bash
npm run preflight:migration          # add --no-fetch to skip the network fetch
```

### One-command release, gates included

Inspect the manifest **before** applying. `migration:dry-run` runs that one step and touches nothing:

```bash
npm run migration:dry-run
```

Read every line. Only once you have, apply:

```bash
MDEAI_CONFIRM_PUSH=1 npm run push:migration
```

`push:migration` runs the steps above in order — **preflight → dry-run → acknowledgement → push** —
in one process and stops at the first that fails:

- The `preflight:migration` gate runs first. On a feature branch, a dirty tree, or a `HEAD` that is
  not `origin/main` it fails and nothing reaches the database.
- `supabase db push --dry-run` re-prints the manifest immediately before the push, so the list
  printed in that run is the list applied in that same run.
- `scripts/confirm-migration-push.mjs` refuses unless `SUPABASE_DB_URL` is set **and**
  `MDEAI_CONFIRM_PUSH=1`. Without the token the run stops after the dry-run.

`MDEAI_CONFIRM_PUSH=1` is a **deliberate-intent token, not proof that the manifest was read.** It is
set before the dry-run runs, so it cannot attest to what the dry-run printed — which means the
acknowledged command *does* push as a side effect of a single invocation. What it buys is that the
push cannot happen by accident, or from a remembered command; it cannot stop an operator who sets
the token without looking. That is why the inspection step above is mandatory rather than an
optimisation, and why running `migration:dry-run` and `push:migration` as two separate commands is
the recommended flow. The individual pieces stay available for the cases where you need them
separately.

These npm scripts interpolate the connection string with POSIX shell syntax
(`"$SUPABASE_DB_URL"`), so they assume a POSIX shell — macOS, Linux, WSL, or Git Bash. Under
`cmd.exe` or PowerShell the variable is not expanded and Supabase rejects the literal
`$SUPABASE_DB_URL`: the command fails before reaching the database, which is the safe direction but
not a useful one. On Windows, use WSL/Git Bash or call `npx supabase db push --db-url <url>`
directly.

### The dry-run list **is** the deployment manifest

Read every line. If it contains anything outside the approved task, **stop**. Do not skim it.

### Why each check exists

| Check | Failure it prevents |
| -- | -- |
| Clean tracked tree | A dirty migration is pushed under a clean-looking commit. |
| **Every migration `db push` would apply is tracked in Git** | `db push` reads the working directory, not Git, so an uncommitted migration **is** pushed. A generic "working tree clean" check misses it: untracked files elsewhere make the tree merely *noisy*, not obviously dangerous. |
| Branch is `main` | **This is the SAN-1313 near-miss.** A feature branch carried two unreviewed migrations; a push from it would have sent them to production alongside the intended one. |
| `HEAD == origin/main` | A release must ship what is on the remote, not a local commit that was never reviewed. |
| Ledger matches Git | See below. |

#### Why that check scans the directory instead of asking Git

"Which files are untracked?" is a different question from "which files will be pushed?", and Git answers it wrong in both directions:

| File on disk under `supabase/migrations/` | `git ls-files --others --exclude-standard` | `supabase db push` | Consequence |
| -- | -- | -- | -- |
| gitignored `*.sql` | hidden — `--exclude-standard` skips it | **applied** | The check says PASS while production receives an unreviewed migration. |
| `*.SQL`, `*.Sql` | reported | skipped — *"file name must match pattern `<timestamp>_name.sql`"* | False alarm; blocks a release over a file that is never applied. |
| anything in a subdirectory | reported | skipped — `db push` reads the top level only | False alarm. |

So the guard lists what the CLI would actually apply and subtracts what Git tracks. The rule is taken from supabase/cli `ListLocalMigrations` (`apps/cli-go/pkg/migration/list.go`) and `migrateFilePattern` (`apps/cli-go/pkg/migration/file.go`), and was confirmed against a live `db push --dry-run`: the dry run pushed a gitignored `.sql` while skipping both an uppercase `.SQL` and a subdirectory file.

Two things follow from the third row:

* **`.gitignore` does not protect production.** A gitignored migration is still applied. Force-add it (`git add -f`) if it belongs in the release, or delete it — do not leave it on disk.
* Archived migrations belong in a subdirectory, which is why `supabase/migrations/_archive-not-on-remote/` is inert and safe to keep.

### The ledger and Git can disagree — check both

`supabase migration list` compares local filenames against `supabase_migrations.schema_migrations`. They can disagree in two independent directions:

* **In Git, not in the ledger** — genuinely pending, will be applied.
* **In the ledger, not in Git** — the migration was applied from an uncommitted local state under a **different timestamp**. `db push` refuses to run at all in this case.

SAN-1286 was applied to production as `20260924055208` while the repository held it as `20260922095853` — the same migration, two version numbers, and a timestamp that never existed in Git. `db push` failed with *"Remote migration versions not found in local migrations directory"* until the ledger was reconciled.

**First prove the two versions are the same migration.** `migration repair` changes history only, so
`--status applied` marks the canonical version complete **without executing its SQL**. If the stray
ledger row ran different SQL — or none — repairing skips that migration and the schema never
receives it. A ledger that disagrees about *content* is a different problem from one that disagrees
about a timestamp, and repairing would hide it.

So confirm the canonical migration's changes are already live before repairing. Both checks are
read-only:

* **Compare the SQL.** The ledger keeps a `statements` array for CLI-applied migrations, so a
  read-only query against `supabase_migrations.schema_migrations` returns the stray row's SQL
  verbatim; compare it with the canonical file. `docs/02-architecture/migration-drift.md` §2.2
  records a worked recovery of two migrations by exactly this method.
* **Or check the objects.** The column, index, or function the canonical file defines must exist live
  with the definition that migration would have produced.
  `docs/02-architecture/migration-drift.md` §2.3 calls this "evidence its effect is live".

If either check shows the canonical changes are **not** already present, stop and investigate instead
of repairing, and decide explicitly whether the canonical migration must actually run.

**Prefer reconciling both sides over replaying:**

```bash
supabase migration repair <canonical-git-version> --status applied  --db-url "$SUPABASE_DB_URL"
supabase migration repair <stray-ledger-version> --status reverted --db-url "$SUPABASE_DB_URL"
```

Order matters: add the canonical version **first**. If the second command fails, production still records the migration as applied. `migration repair` changes migration history only — it never executes or reverts migration SQL. `reverted` deletes the history row; it does **not** roll back schema.

Replaying the canonical file instead works only if that file is idempotent, and it is strictly worse: it re-runs DDL for an object that already exists.

### Destructive migrations

A `DROP` needs a recovery path decided **before** the apply, not after:

* Prefer `RESTRICT` over `CASCADE` — an unnoticed dependency becomes an error instead of silently deleting a neighbour.
* Take the backup to a location **outside this repository**, encrypted where the data is personal. It is unmasked data: never commit it, attach it to Linear, or paste it into a PR or CI artifact.
* A `pg_dump` client older than the server refuses outright (`aborting because of server version mismatch`). Match the major version.
* Record the retention/delete date and confirm the encryption key is escrowed — a backup whose key lives on one machine is not a backup.

### Tokens

`--db-url` is a complete path for `migration list`, `migration repair`, `db push`, and `db push --dry-run`. **Do not rotate or debug credentials during a destructive database task** — an expired access token is a separate fix, not a reason to abandon a working path mid-apply.
