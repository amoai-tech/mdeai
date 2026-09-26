/**
 * SAN-547 — make `mastra_threads` ownership immutable at the database boundary.
 *
 * THE DEFECT THIS CLOSES
 * ----------------------
 * The route authorizes a *named but not-yet-existing* thread as "new": any
 * authenticated caller may create it under their own resource. That check and the
 * runtime's write are two separate steps, and the runtime write is an upsert:
 *
 *   INSERT INTO mastra_threads (id, "resourceId", …) VALUES (…)
 *   ON CONFLICT (id) DO UPDATE SET "resourceId" = EXCLUDED."resourceId"   -- ← here
 *
 * (`@mastra/pg@1.11.0`, `dist/index.js` `saveThread`.)
 *
 * So when two users race the same fresh thread id, both read "does not exist",
 * both authorize, and the second writer's `DO UPDATE` silently **reassigns** the
 * owner to itself. The loser's conversation then lives in a thread owned by the
 * other user — the exact cross-user read this task exists to prevent.
 *
 * WHY A TRIGGER AND NOT AN APPLICATION LOCK
 * -----------------------------------------
 * A lock in the route would have to be held across the runtime's own write, which
 * the route does not control, and it would protect only this one caller. The
 * invariant belongs where ownership lives: PostgreSQL then enforces it for the
 * Mastra runtime, for any future route, and for a hand-written statement alike.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * The guard is `BEFORE UPDATE` only, and only rejects a *change* of an existing
 * non-null owner:
 *
 *   no row      → INSERT           allowed   (first claim)
 *   owner X     → owner X          allowed   (Mastra re-saves the same thread
 *                                             for its own owner on every turn)
 *   owner X     → owner Y          REJECTED  (42501)
 *   owner X     → NULL             REJECTED  (42501)
 *
 * A row with a null owner could only be claimed once, which is why the condition
 * keeps `OLD."resourceId" IS NOT NULL` explicit rather than relying on the column
 * being `NOT NULL` today: if the vendor ever relaxes that, the guard degrades to
 * "an unowned thread may be claimed once" instead of "an unowned thread can never
 * be claimed".
 *
 * Rejection uses `ERRCODE 42501` (insufficient_privilege) so a caller can tell
 * "you may not take this thread" apart from an ordinary database fault, matching
 * the refusal code the RPC ACL boundary already asserts.
 *
 * Repository conventions followed (both are enforced by existing tests):
 *   * trigger functions pin `search_path` — SAN-1331 / MDE-SEC-004, Advisor lint 0011
 *   * trigger functions have EXECUTE revoked from end-user roles — SAN-1284 Batch 0C
 */
import { Client } from "pg";

export const THREAD_OWNERSHIP_GUARD_NAME = "mastra_threads_owner_immutable";

/** The refusal code a losing racer sees. */
export const THREAD_OWNERSHIP_REJECTION_CODE = "42501";

/**
 * `anon` / `authenticated` are Supabase roles. A plain PostgreSQL (the
 * `mastra-schema-init` CI job runs `postgres:17`) has neither, so revoking from
 * them unconditionally would fail there. `PUBLIC` always exists and is the grant
 * that actually matters; the named roles are narrowed when present.
 */
export const THREAD_OWNERSHIP_GUARD_SQL = `
CREATE OR REPLACE FUNCTION public.${THREAD_OWNERSHIP_GUARD_NAME}()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
BEGIN
  IF OLD."resourceId" IS NOT NULL
     AND NEW."resourceId" IS DISTINCT FROM OLD."resourceId" THEN
    RAISE EXCEPTION
      'mastra_threads % is owned by % and cannot be reassigned to %',
      OLD.id, OLD."resourceId", NEW."resourceId"
      USING ERRCODE = '${THREAD_OWNERSHIP_REJECTION_CODE}';
  END IF;
  RETURN NEW;
END;
$guard$;

REVOKE ALL ON FUNCTION public.${THREAD_OWNERSHIP_GUARD_NAME}() FROM PUBLIC;

DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.${THREAD_OWNERSHIP_GUARD_NAME}() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.${THREAD_OWNERSHIP_GUARD_NAME}() FROM authenticated';
  END IF;
END;
$roles$;

DROP TRIGGER IF EXISTS ${THREAD_OWNERSHIP_GUARD_NAME} ON public.mastra_threads;

CREATE TRIGGER ${THREAD_OWNERSHIP_GUARD_NAME}
  BEFORE UPDATE ON public.mastra_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.${THREAD_OWNERSHIP_GUARD_NAME}();
`;

/**
 * Apply the guard. Safe to re-run: the function is replaced and the trigger is
 * dropped and recreated, so a second call is a no-op in effect, not an error.
 *
 * Must run **after** the Mastra schema exists — `mastra_threads` is a vendor-owned
 * table that only `PostgresStore.init()` creates, which is why this is not a
 * `supabase/migrations/**` file: a fresh `supabase db reset` has no such table,
 * so a migration referencing it would fail to replay.
 */
export async function applyThreadOwnershipGuard(client) {
  await client.query(THREAD_OWNERSHIP_GUARD_SQL);
}

/** Open a client, apply the guard, close it. Used by the init entry point. */
export async function applyThreadOwnershipGuardTo(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await applyThreadOwnershipGuard(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}
