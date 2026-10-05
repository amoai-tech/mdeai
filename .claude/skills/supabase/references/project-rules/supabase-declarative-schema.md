---
paths:
  - "supabase/**"
---

# Database: Declarative schema (conditional / future)

## Conditional / future workflow

MDE does **not** currently use the declarative-schema workflow. In `supabase/config.toml`,
the active `[db.migrations]` section has `schema_paths = []`, and there is no active
`[experimental.pgdelta]` block.

Use `references/project-rules/supabase-migrations.md` and the imperative
`supabase migration new <name>` workflow while MDE remains on this path.

This file becomes active guidance only after MDE intentionally adopts declarative schemas,
establishes canonical schema files, and reviews the migration/release process for that change.
Do not infer declarative mode merely from this file or from `schema_paths` alone.

## If MDE intentionally enables declarative schemas

Check the configured diff engine first:

- **pg-delta** — when `[experimental.pgdelta] enabled = true`, `schema_paths` is ignored.
  Keep declarative files in `supabase/schemas/` and generate migrations with
  `supabase db schema declarative sync`.
- **legacy migra** — without pg-delta, configure declarative files through
  `[db.migrations].schema_paths` and use the supported legacy `supabase db diff` workflow.

Then:

1. Treat the configured declarative files as the desired schema state.
2. Generate migrations with the command for the active diff engine and inspect every generated
   migration before applying it.
3. Keep production release safeguards from `supabase-migrations.md`: preflight, dry-run,
   exact manifest inspection, then an explicitly approved push.
4. For rollback, change the desired schema state and generate/review a new forward migration.
   Do not edit already-applied production migration history.

## Known declarative-diff caveats

Schema diffing does not capture every database change reliably. When declarative mode is enabled,
keep versioned migration SQL for changes that the diff cannot faithfully represent, including:

- data manipulation such as `insert`, `update`, and `delete`
- view ownership, grants, and some view recreation cases
- some RLS policy changes and column privileges
- schema privileges, comments, partitions, domains, and some publication changes

Review generated SQL for security, grants, RLS, destructive operations, and unintended diff noise
before it reaches the production release flow.
