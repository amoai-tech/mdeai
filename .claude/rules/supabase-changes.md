---
paths:
  - "supabase/**"
---

# Supabase change rules

These load only when you work on `supabase/**`. The `supabase` skill owns the detailed procedure; this file is the short list of things that are expensive to get wrong.

- Migrations are append-only. Never edit or delete a migration that has already been applied — add a new timestamped file.
- Every new table ships RLS enabled plus at least one explicit authorization policy in the same migration. A table left without RLS is a finding, not a follow-up.
- A `SECURITY DEFINER` function needs `SET search_path = ''` and fully qualified object names (`public.my_table`), plus an explicit `auth.uid()` guard, because it runs as the owner rather than the caller. `SET search_path = public` is not enough: `public` is writable by callers, so a shadowing object can hijack the lookup.
- Never widen a policy to make a failing test pass. Fix the policy or fix the caller.
- Prove database changes with pgTAP under `supabase/tests/database/`; application tests alone do not prove a policy or a constraint.
- Record the applied timestamp and the verification output in the task evidence, not just in the chat.
