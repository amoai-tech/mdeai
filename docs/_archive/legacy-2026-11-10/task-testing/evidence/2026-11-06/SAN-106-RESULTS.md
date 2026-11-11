# SAN-106 · MAP-006 — Nearby Search + Show nearby on RentalCard

## Review fix and targeted tests (2026-11-06)

PR: https://github.com/amoai-tech/mdeai/pull/783

The café-follow-up predicate distinguishes cafés near a rental from a rental near cafés. Google Maps links require HTTPS and an exact accepted host, with the proper Maps path. Tool-originated Nearby requires a non-anonymous authenticated user whose Supabase identity matches the server-derived request identity before grounding quota is consumed or Places is called. The rental lookup uses the existing RLS client, not service_role or an anonymous fallback.

### Evidence
- Four focused Vitest files: 30/30 passed on the working tree before final docstrings.
- Changed-file ESLint: passed.
- Tested deceptive hostnames, invalid URL schemes, reversed search meaning, guest/service-only identity, anonymous identity, mismatched user, and authenticated user.
- TypeScript, exact-head CI, Codacy: state only their independently verified result, not presumed from previous SHAs.
- Codacy test-only XSS flags refer to renderToStaticMarkup assertions, with no HTML inserted into a browser sink; not proven vulnerabilities.
- SupabaseClient<Database> | null is the standard typed client union, with no any directly in the declared union.
- Removed unused async modifier from the test helper.

No DB changes, new search engine, business gates, or new credential exposure. Real Google Places response and production promotion remain separately required evidence.
