---
paths:
  - "supabase/**"
---

# Database: Declarative schema (conditional / future)

## Conditional / future workflow

MDE does **not** currently use the declarative-schema workflow. In `supabase/config.toml`,
`[db.migrations]` has `schema_paths = []`.

Use `references/project-rules/supabase-migrations.md` and the imperative
`supabase migration new <name>` workflow while that remains true.

This file becomes active guidance only after MDE intentionally adopts declarative schemas:
`schema_paths` is non-empty, the canonical schema files exist under `supabase/schemas/`, and
the migration/release process has been updated and reviewed for that change. Do not infer that
declarative mode is active merely because this reference file exists.

## If MDE intentionally enables declarative schemas

1. Treat the configured files in `supabase/schemas/` as the desired schema state.
2. Keep schema files ordered so dependencies resolve deterministically.
3. Generate migrations from the declared state with the supported Supabase CLI workflow and
   inspect every generated migration before applying it.
4. Keep production release safeguards from `supabase-migrations.md`: preflight, dry-run,
   exact manifest inspection, then an explicitly approved push.
5. For rollback, change the desired schema state and generate/review a new forward migration.
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
