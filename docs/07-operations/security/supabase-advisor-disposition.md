# Supabase Security Advisor — residual finding disposition (SAN-1331)

**Task:** SAN-1331 · Task 138 · MDE-SEC-004 — finish residual Supabase advisor + Auth cleanup
**Project:** `zkwcbyxiwklihegjhuql` (`medellin`)
**Migration:** `supabase/migrations/20260920140000_san1331a_trigger_set_timestamps_search_path.sql`
**Regression test:** `supabase/tests/database/san1331a_trigger_search_path_test.sql`
**Evidence window:** before `2026-09-20T12:25:06Z` · after `2026-09-20T12:39:29Z`

This file is the durable record of which Security Advisor findings MDE fixes in code,
which are platform-owned, and which are consciously accepted. Re-read it before
"fixing" an advisor finding that this document already dispositions.

## Before → after

| Advisor lint | Level | Before | After | Disposition |
| --- | --- | --- | --- | --- |
| `function_search_path_mutable` | WARN | 1 | **0** | Fixed by migration `20260920140000` |
| `rls_disabled_in_public` (`spatial_ref_sys`) | ERROR | 1 | 1 | Accepted — extension-owned, see below |
| `extension_in_public` | WARN | 3 | 3 | Accepted — platform-owned, see below |
| `auth_leaked_password_protection` | WARN | 1 | 1 | Blocked by Free plan, see below |
| `rls_enabled_no_policy` (`fashionos_*`) | INFO | 8 | 8 | Intentional (service-role only, SAN-…/PR #98) |
| `anon_security_definer_function_executable` | WARN | 27 | 27 | Owned by SAN-1284 |
| `authenticated_security_definer_function_executable` | WARN | 34 | 34 | Owned by SAN-1284 |

## Fixed — `function_search_path_mutable`

Only ever one app-owned function was flagged. Two earlier migrations already pinned it
(`20260530012233_data010_search_path_hardening.sql`, `20260531215952_data049_advisor_remediation.sql`)
and both are recorded as applied in `supabase_migrations.schema_migrations`, but production
still reported `proconfig = NULL` — the definition had been replaced out-of-band.

Writing the regression test surfaced a **second, opposite-direction drift**: a later
`CREATE OR REPLACE FUNCTION` in the SAN-1284a/SAN-1284b batches recreated five SECURITY
DEFINER ticket/staff RPCs without their `SET` clause, so a fresh replay lost a pin that
production still carried.

| Function | Production before | Fresh replay before | After |
| --- | --- | --- | --- |
| `trigger_set_timestamps()` | `NULL` | `search_path=""` | `search_path=""` |
| `bump_staff_link_version(uuid)` | `public, pg_temp` | `NULL` | `public, pg_temp` |
| `ticket_checkout_cancel(uuid)` | `public, pg_temp` | `NULL` | `public, pg_temp` |
| `ticket_checkout_create_pending(...)` | `public, pg_temp` | `NULL` | `public, pg_temp` |
| `ticket_payment_finalize(uuid, text)` | `public, pg_temp` | `NULL` | `public, pg_temp` |
| `ticket_validate_consume(text)` | `public, pg_temp` | `NULL` | `public, pg_temp` |

The five RPCs are pinned to the value **already running in production**, copied verbatim
from the live catalogue. That converges replay to production instead of changing production
behaviour on the ticket checkout / payment path. Restoring `data010`'s `''` for those five
would be a behaviour change on a payment path and is deliberately out of scope here.

The migration is forward-only and idempotent: six `ALTER FUNCTION ... SET search_path`
statements, no data change, no ACL change.

## Accepted — `public.spatial_ref_sys` (RLS Disabled in Public)

`spatial_ref_sys` is **PostGIS extension-owned**, not an application table:

- `pg_extension.extowner = supabase_admin`, `extrelocatable = false`
- owner of the table itself: `supabase_admin`
- `relacl` grants `arwdDxtm` to `anon`/`authenticated`/`service_role`, grantor `supabase_admin`

Enabling RLS or revoking those grants requires **ownership of the table or of the
extension**. The migration role is `postgres`, and in this project
`pg_has_role('postgres','supabase_admin','MEMBER') = false`. There is therefore **no
statement the migration role can run** to change this object — an attempt fails with
`42501: must be owner of ...`. This matches the upstream report that the documented
`alter extension ... set schema ...` remediation fails on Supabase precisely because the
platform created the extension as `supabase_admin`
([supabase/supabase#29122](https://github.com/supabase/supabase/issues/29122)).

Residual risk is accepted as **low**: `spatial_ref_sys` is a static EPSG SRID lookup, not
tenant or user data. Its only Data API exposure is the SRID catalogue plus the PostGIS
`st_estimatedextent` RPC overloads counted under the SAN-1284 SECURITY DEFINER findings.

**Remediation path if this is ever prioritised:** request platform/`supabase_admin` action,
or rehearse `DROP`/`CREATE EXTENSION postgis WITH SCHEMA extensions` in a maintenance
window. That would cascade to every dependent geometry/geography object and must not be
attempted casually.

## Accepted — `extension_in_public` (`pg_trgm`, `postgis`, `vector`)

All three are owned by `supabase_admin`, so none can be relocated by the migration role
(same ownership rule as above). Disposition per extension:

- **`postgis`** — `extrelocatable = false`. Cannot be moved in place at all. It is installed
  in `public` by `20260404044720_remote_schema.sql`, and a fresh replay reproduces exactly
  that, so replay and production agree here.
- **`pg_trgm`** — relocatable in principle, but owned by `supabase_admin`. It is unused by the
  application: there are **no** `gin_trgm_ops` / `gist_trgm_ops` indexes anywhere in
  production or in the migrations. Its only exposure is the extension's own utility
  functions (`show_trgm`, `similarity`, ...) becoming `/rest/v1/rpc/*` endpoints. Accepted:
  they are pure text functions with no data access.
- **`vector`** — **genuine replay/production drift.** `20260509205216_pgvector_semantic_search.sql`
  requests `with schema extensions`; a fresh replay installs it in `extensions`, while
  production has it in `public` — `CREATE EXTENSION IF NOT EXISTS` does not relocate an
  already-installed extension. Relocation is blocked by the same ownership rule, and
  `DROP`/`CREATE` would cascade to the `embedding vector(768)` columns on
  `listing_embeddings`, `event_embeddings` and `restaurant_embeddings`.

  Accepted for this release **because the drift is cosmetic for the application**: the type
  resolves under either schema (replay's `search_path` includes `extensions`; production
  resolves `vector` from `public`), the tables/indexes/RPCs are unaffected, and every
  embedding column is stored by OID, not by schema name. Semantic search is not affected —
  proven by the pgvector tables and RPCs surviving `supabase db reset` + `supabase test db`.

  **Remediation path:** align production to match replay via a platform action, or accept
  `public` as the canonical location and change the replay to match in a future migration
  once the extension can be dropped/recreated in a maintenance window with the embeddings
  re-generated. Do not add an `alter extension vector set schema extensions` migration: it
  would succeed in local replay (superuser) and **fail in production**, breaking
  `supabase db push`.

## Blocked by plan — leaked-password protection

`password_hibp_enabled = false` on the project. Enabling it was attempted through the
Management API:

```
PATCH /v1/projects/zkwcbyxiwklihegjhuql/config/auth  {"password_hibp_enabled": true}
HTTP 402 — "Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up."
```

The organisation `amo` (`oziabrsrfsussadbbcep`) is on the **`free`** plan, and
[Supabase documents leaked password protection as Pro Plan and above](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

This is recorded as a **platform constraint, not a fixed finding**. It cannot be closed from
this repository; it closes when the project is upgraded to Pro and the setting is enabled in
Auth settings.

## Owned elsewhere — SECURITY DEFINER exposure

`anon_security_definer_function_executable` (27) and
`authenticated_security_definer_function_executable` (34) are classification/privilege
decisions over application RPCs. **SAN-1284 owns them.** SAN-1331 consumes SAN-1284's
result and must not duplicate its migrations.

One entry in that set is extension-owned and therefore out of SAN-1284's reach as well:
`public.st_estimatedextent` (3 overloads), a PostGIS SECURITY DEFINER function that leaks
table statistics. It is dispositioned under the PostGIS item above.

## Reproduce the evidence

```bash
# live advisor before/after
#   Supabase Dashboard → Advisors → Security, or
#   GET https://api.supabase.com/v1/projects/zkwcbyxiwklihegjhuql/config/auth

# replay + regression
supabase db reset
supabase test db
supabase db lint
```

The pgTAP suite asserts the pin is present, that **no** app-owned function in `public` is
left with a role-mutable `search_path` (so a future `CREATE OR REPLACE` without its `SET`
clause fails CI), and that the `trigger_set_timestamps` trigger still fires end-to-end.
