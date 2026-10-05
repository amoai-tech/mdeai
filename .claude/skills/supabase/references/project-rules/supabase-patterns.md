---
parent: supabase
title: Supabase Patterns
description: Client usage, RLS mindset, schema habits for mdeai.co. Path-scoped rule symlinked from .claude/rules/supabase-patterns.md.
paths:
  - "src/**"
  - "src/integrations/supabase/**"
  - "supabase/**"
---

# Supabase Patterns

## Client Usage

- Import from `@/integrations/supabase/` — never create new clients
- Use `supabase.from()` for all queries — no raw SQL from frontend
- Always handle `.error` — Supabase returns `{ data, error }`, not exceptions

```tsx
const { data, error } = await supabase.from('apartments').select('*').limit(50);
if (error) throw new Error(error.message);
```

## RLS Policy Rules

- Every table has RLS enabled — no exceptions
- SELECT: public for listings, user-scoped for personal data
- INSERT/UPDATE/DELETE: always require `auth.uid()` match
- Use subquery pattern: `(select auth.uid())` not direct `auth.uid()`
- Service/secret keys bypass RLS; they are never authorization. Keep them server-only and use them only for an intentional privileged carve-out.
- Before any privileged write, independently authenticate the actor, authorize the action, and validate ownership/version/state. Prefer user-scoped/RLS writes when elevated access is unnecessary.

## Schema Changes

- All changes via migration files in `supabase/migrations/`
- Never modify `auth.users` — extend via `profiles` table
- Foreign keys use `ON DELETE CASCADE` where parent owns children
- Add indexes on: foreign keys, filter columns, frequently sorted columns

## Query Patterns

- Default pagination: `.range(0, 49)` (50 items)
- Always `.select()` only needed columns for list views
- Use `.single()` when exactly one row is a business invariant; use `.maybeSingle()` when zero rows is a valid result. Handle the returned error in either case.
- Realtime via `useRealtimeChannel` hook — don't roll your own

## Security

- `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) — safe for frontend
- Service/secret keys — server-only, never in `VITE_` vars; possession of the key does not replace actor authorization
- `.env` contains only public keys — secrets in Supabase dashboard
