import type { BrowserContext, Page } from "@playwright/test";
import type { Session } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const QA_SUPER_ADMIN_EMAIL = "mde@socialmediaville.ca";
/** Legacy default for signed-in QA: now the same verified Super Admin account.
 * Use throwaway identities when testing ordinary-user permissions. */
export const QA_HOST_EMAIL = QA_SUPER_ADMIN_EMAIL;

/** Load `.env.local` into process.env for e2e helpers (Playwright doesn't read it). */
export function loadEnvLocalForE2E(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function supabaseEnv() {
  loadEnvLocalForE2E();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  return { url, anon, serviceKey };
}

/** Reject fake CI backend credentials before trying authenticated QA journeys. */
export function hasE2eEnv(): boolean {
  const { url, anon, serviceKey } = supabaseEnv();
  if (!url || !anon || !serviceKey || anon === "sb_publishable_test") return false;
  try {
    const parsed = new URL(url);
    if ((parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") && parsed.port === "9") {
      return false;
    }
    // Never send a service-role QA request over plaintext to an arbitrary remote host.
    // Local Supabase CLI is the only supported HTTP exception.
    return parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  } catch {
    return false;
  }
}

/**
 * Service-role Supabase client for test-side setup and postconditions.
 *
 * Stays in the Playwright process: it is never injected into a browser context,
 * never serialized into a cookie, and never handed to the app. SAN-547 uses it
 * to create/delete throwaway identities and to read `mastra_threads`, which is
 * FORCE-RLS + service-role-only and therefore unreadable to any user client.
 */
export async function getSupabaseAdmin() {
  const { url, serviceKey } = supabaseEnv();
  if (!url || !serviceKey) {
    throw new Error("E2E Supabase admin env missing (url/serviceKey)");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A confirmed auth user that exists only for the duration of one proof run. */
export type ThrowawayIdentity = { email: string; userId: string };

/** Every disposable QA identity lives on this domain (see createThrowawayIdentity). */
const QA_IDENTITY_DOMAIN = "@qa-isolation.mdeai.co";
/** A page cap that is still returning full pages means the listing is unreadable. */
const MAX_AUTH_USER_PAGES = 100;

/** List every auth user, to completion, or throw. A partial listing is never a count. */
async function listAllAuthUsers(
  admin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
): Promise<Array<{ id: string; email?: string | null; created_at?: string }>> {
  const all: Array<{ id: string; email?: string | null; created_at?: string }> = [];
  for (let page = 1; page <= MAX_AUTH_USER_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < 200) return all;
  }
  throw new Error(
    `listUsers still returned full pages after ${MAX_AUTH_USER_PAGES} pages; refusing to report a count`,
  );
}

/**
 * Settle a test's own disposable identity without hiding a leak.
 *
 * `deleteThrowawayIdentity` throws on partial cleanup on purpose: swallowing that is
 * what previously left orphaned rows behind. So:
 * - if the test body PASSED and cleanup fails, rethrow — a green run must prove that
 *   nothing leaked;
 * - if the body already FAILED, report the cleanup failure loudly but let the original
 *   failure surface, so the real reason is not masked.
 */
export async function settleOwnedCleanup(options: {
  email: string;
  bodyError: unknown;
  cleanup: () => Promise<void>;
  log?: (message: string) => void;
}): Promise<void> {
  try {
    await options.cleanup();
  } catch (cleanupError) {
    const detail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
    if (!options.bodyError) throw cleanupError;
    const log = options.log ?? ((message: string) => console.error(message));
    log(`[qa cleanup] the test failed AND its identity could not be removed (${options.email}): ${detail}`);
  }
}

/**
 * Clean up disposable identities left behind by an interrupted run.
 *
 * Ownership rules (a sweep must never interfere with a live journey):
 * - identities created by THIS suite (`ownedIds`) are always eligible, so a failed
 *   per-test cleanup cannot leave them behind;
 * - any other identity is eligible only when it is older than `olderThan`, which the
 *   caller sets beyond the longest possible run, so an overlapping run's identity is
 *   never treated as abandoned;
 * - listing, deletion and verification errors are THROWN or reported, never ignored:
 *   an unreadable state is not zero orphans.
 */
export async function sweepThrowawayIdentities(options: {
  prefix: string;
  olderThan: Date;
  ownedIds?: readonly string[];
}): Promise<{ orphans: number; problems: string[] }> {
  const admin = await getSupabaseAdmin();
  const owned = new Set(options.ownedIds ?? []);
  const isCandidate = (user: { email?: string | null }) =>
    (user.email ?? "").startsWith(options.prefix) && (user.email ?? "").endsWith(QA_IDENTITY_DOMAIN);
  const isAbandoned = (user: { id: string; created_at?: string }) =>
    owned.has(user.id) ||
    Boolean(user.created_at) && new Date(user.created_at!).getTime() < options.olderThan.getTime();

  const users = await listAllAuthUsers(admin);
  const doomed = users.filter((user) => isCandidate(user) && isAbandoned(user));
  const problems: string[] = [];

  for (const user of doomed) {
    const { data: threads, error: threadsError } = await admin
      .from("mastra_threads").select("id").eq("resourceId", user.id);
    if (threadsError) {
      problems.push(`select threads for ${user.id}: ${threadsError.message}`);
      continue;
    }
    const threadIds = (threads ?? []).map((row) => row.id);
    if (threadIds.length) {
      const { error } = await admin.from("mastra_messages").delete().in("thread_id", threadIds);
      if (error) {
        problems.push(`delete messages for ${user.id}: ${error.message}`);
        continue;
      }
    }
    const { error: threadsDeleteError } = await admin.from("mastra_threads").delete().eq("resourceId", user.id);
    if (threadsDeleteError) {
      problems.push(`delete threads for ${user.id}: ${threadsDeleteError.message}`);
      continue;
    }
    const { error: profileError } = await admin.from("profiles").delete().eq("id", user.id);
    if (profileError) {
      problems.push(`delete profile for ${user.id}: ${profileError.message}`);
      continue;
    }
    const { error: authError } = await admin.auth.admin.deleteUser(user.id);
    if (authError && authError.status !== 404) {
      problems.push(`delete identity ${user.id}: ${authError.message}`);
    }
  }

  // Verify from a fresh read: the account AND its rows must be gone.
  const after = await listAllAuthUsers(admin);
  const remaining = after.filter((user) => isCandidate(user) && isAbandoned(user));
  for (const user of remaining) {
    problems.push(`identity still present: ${user.id}`);
    const { data: threads, error } = await admin.from("mastra_threads").select("id").eq("resourceId", user.id);
    if (error) problems.push(`verify threads for ${user.id}: ${error.message}`);
    else if ((threads ?? []).length > 0) problems.push(`threads remain for ${user.id}`);
    const { data: profile, error: profileError } = await admin.from("profiles").select("id").eq("id", user.id);
    if (profileError) problems.push(`verify profile for ${user.id}: ${profileError.message}`);
    else if ((profile ?? []).length > 0) problems.push(`profile remains for ${user.id}`);
  }

  return { orphans: remaining.length, problems };
}

/** Best-effort removal of any account created under an exact email (ambiguous create). */
async function deleteAuthUsersByEmail(
  admin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
): Promise<void> {
  const remove = async (users: Array<{ id: string; email?: string | null }>): Promise<boolean> => {
    const match = users.find((user) => user.email === email);
    if (match) await admin.auth.admin.deleteUser(match.id);
    return Boolean(match);
  };
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    if (error) return;
    if (await remove(users)) return;
    // A short page is the last page; nothing more to scan.
    if (users.length < 200) return;
  }
}

/**
 * Create a confirmed throwaway auth user (SAN-547).
 *
 * A second *permanent* QA account would work too, but it would accumulate every
 * run's threads under one long-lived resource id, so "which rows belong to this
 * run?" stops being answerable by query alone. A per-run identity makes the
 * database postcondition exact: every row owned by this id was written by this
 * run, and cleanup can be proven by deletion rather than inferred from a
 * timestamp window.
 */
export async function createThrowawayIdentity(label: string): Promise<ThrowawayIdentity> {
  const admin = await getSupabaseAdmin();
  // randomUUID, not Math.random: two runs starting in the same millisecond must
  // not be able to mint the same identity and then delete each other's rows.
  const email = `${label}-${randomUUID()}@qa-isolation.mdeai.co`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) {
    // The account can exist even when the create response is lost. Delete anything
    // created under this exact email before throwing, so a failed setup cannot leak
    // a live QA login that no `afterAll` can find (it never received an identity).
    await deleteAuthUsersByEmail(admin, email).catch(() => undefined);
    throw error ?? new Error(`createUser returned no user for ${label}`);
  }
  return { email, userId: data.user.id };
}

type AdminClient = Awaited<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Errors that only mean the vendor-owned Mastra tables are not provisioned here.
 *
 * The stable codes are authoritative; the message checks below are defense-in-depth
 * only (a code could be absent on a different error path). They are deliberately
 * relation/table-specific: a bare "does not exist" substring would also match a
 * missing *column*, which must NOT be mistaken for a missing table (that would skip
 * cleanup on a real error). PostgREST reports an unknown table as PGRST205, Postgres
 * as 42P01 / 'relation "…" does not exist'.
 */
function isMissingMastraTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const text = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist/.test(text) ||
    /could not find the table/.test(text)
  );
}

/**
 * Wait until this identity's thread/message writes have stopped moving.
 *
 * Mastra persists a turn's messages AFTER the stream ends, so "the UI is idle" is not
 * "the database is done". Deleting in that gap stranded late messages on production
 * (2026-10-02). Two identical consecutive reads count as settled, so the 90s ceiling
 * is only ever paid on a genuine stall. The bound matches the existing
 * waitForSettledMessages in e2e/prod-copilotkit-isolation.spec.ts rather than being
 * tuned to an unmeasured latency; lower it only with observed persistence data.
 */
async function waitForSettledThreads(admin: AdminClient, userId: string, timeoutMs = 90_000): Promise<void> {
  const readCount = async (): Promise<number> => {
    const { data, error } = await retryTransientDb(
      () => admin.from("mastra_threads").select("id").eq("resourceId", userId),
    );
    if (error) throw new Error("select threads: " + error.message);
    const ids = (data ?? []).map((row) => (row as { id: string }).id);
    if (ids.length === 0) return 0;
    const { count, error: countError } = await retryTransientDb(
      () => admin.from("mastra_messages").select("id", { count: "exact", head: true }).in("thread_id", ids),
    );
    if (countError) throw new Error("count messages: " + countError.message);
    return count ?? 0;
  };

  const deadline = Date.now() + timeoutMs;
  let previous = -1;
  while (Date.now() < deadline) {
    const current = await readCount();
    if (current === previous) return;
    previous = current;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("persistence did not settle for " + userId + " within " + timeoutMs + "ms");
}

/** Gateway/edge blips (Cloudflare 502/503/504) are retried, not reported as a leak. */
const TRANSIENT_DB_ERROR = /(502|503|504|Bad Gateway|ETIMEDOUT|ECONNRESET|fetch failed)/i;

/** Bounded retries only for transport failures; these test-only deletes are idempotent. */
async function retryTransientDb<T extends { error: { message: string } | null }>(
  operation: () => PromiseLike<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await operation();
      if (!result.error || !TRANSIENT_DB_ERROR.test(result.error.message) || attempt === 2) {
        return result;
      }
    } catch (error) {
      if (!TRANSIENT_DB_ERROR.test(String(error)) || attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  throw new Error("transient database retry exhausted");
}

async function selectThreadIds(
  admin: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
): Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }> {
  let last: { data: Array<{ id: string }> | null; error: { message: string } | null } = {
    data: null,
    error: null,
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await admin.from("mastra_threads").select("id").eq("resourceId", userId);
    last = {
      data: (result.data as Array<{ id: string }> | null) ?? null,
      error: result.error,
    };
    if (!result.error || !TRANSIENT_DB_ERROR.test(result.error.message)) return last;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  return last;
}

/**
 * Delete a throwaway identity, its durable AI memory, and — unlike the auth
 * delete alone — every thread/message the run created under it.
 *
 * Waits for late writes to settle first, then deletes and PROVES the rows are gone.
 * A partial cleanup throws instead of passing green: swallowing it here is what let
 * an earlier run leave orphaned messages behind.
 */
/**
 * Mastra's completion event can precede its fire-and-forget ai_runs write.
 * When a QA test completed a turn, wait for its audit row BEFORE removing the
 * profiles FK target, otherwise the audit insert races with auth cleanup.
 */
async function waitForQaRunAudit(admin: AdminClient, userId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { count, error } = await admin.from("ai_runs")
      .select("id", { count: "exact", head: true }).eq("user_id", userId);
    if (error) throw new Error("QA run audit read failed: " + error.message);
    if ((count ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("QA agent turn finished but ai_runs audit did not persist before cleanup");
}

export async function deleteThrowawayIdentity(
  identity: ThrowawayIdentity,
  options: { waitForAiRunAudit?: boolean } = {},
): Promise<void> {
  if (!identity.email.endsWith("@qa-isolation.mdeai.co")) {
    throw new Error("refusing to delete a non-disposable QA identity");
  }
  const admin = await getSupabaseAdmin();
  const failures: string[] = [];

  // Mastra may save messages just after the final browser event. Settle before cleanup.
  const probe = await selectThreadIds(admin, identity.userId);
  const mastraAbsent = isMissingMastraTable(probe.error);
  if (probe.error && !mastraAbsent) failures.push("select threads: " + probe.error.message);

  if (!mastraAbsent && failures.length === 0) {
    try {
      await waitForSettledThreads(admin, identity.userId);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }

    // Reconcile again if a late persisted turn appeared during the first delete. Do not
    // assume success from a delete response; re-read both tables and require zero.
    for (let attempt = 0; attempt < 3 && failures.length === 0; attempt++) {
      const { data: threads, error: selectError } = await selectThreadIds(admin, identity.userId);
      if (selectError) {
        failures.push("select threads: " + selectError.message);
        break;
      }
      const ids = (threads ?? []).map((row) => row.id);

      if (ids.length > 0) {
        const { error } = await retryTransientDb(
          () => admin.from("mastra_messages").delete().in("thread_id", ids),
        );
        if (error) { failures.push("delete messages: " + error.message); break; }
      }
      const { error: threadsError } = await retryTransientDb(
        () => admin.from("mastra_threads").delete().eq("resourceId", identity.userId),
      );
      if (threadsError) { failures.push("delete threads: " + threadsError.message); break; }

      const remaining = await retryTransientDb(
        () => admin.from("mastra_threads").select("id").eq("resourceId", identity.userId),
      );
      if (remaining.error) {
        failures.push("verify threads: " + remaining.error.message);
        break;
      }
      const remainingMessages = ids.length
        ? await retryTransientDb(() => admin.from("mastra_messages").select("id").in("thread_id", ids))
        : { data: [] as Array<{ id: string }>, error: null };
      if (remainingMessages.error) {
        failures.push("verify messages: " + remainingMessages.error.message);
        break;
      }
      if ((remaining.data ?? []).length === 0 && (remainingMessages.data ?? []).length === 0) {
        break;
      }
      if (attempt === 2) {
        failures.push("Mastra rows remain after 3 cleanup attempts");
      } else {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
  }

  // The test can prove its AI audit is durable before the FK target disappears.
  // Keep cleanup best-effort even when the audit is missing, but fail the test.
  let auditFailure: string | null = null;
  if (options.waitForAiRunAudit) {
    try {
      await waitForQaRunAudit(admin, identity.userId);
    } catch (error) {
      auditFailure = error instanceof Error ? error.message : String(error);
    }
  }

  // Never delete the auth owner while its private Mastra rows might remain.
  // Keep the disposable identity available for a later safe cleanup retry.
  if (failures.length > 0) {
    throw new Error("cleanup failed for " + identity.email + " — " + failures.join("; "));
  }

  const { error: userError } = await retryTransientDb(
    () => admin.auth.admin.deleteUser(identity.userId),
  );
  if (!userError) {
    // A 200 from deleteUser is a claim, not proof. Read the account back: a cleanup
    // that reports success while the identity still exists leaves a live throwaway
    // QA login behind.
    const afterDelete = await retryTransientDb(
      () => admin.auth.admin.getUserById(identity.userId),
    );
    // Supabase returns a 404 "User not found" for a successfully deleted user.
    // A different lookup error does not verify deletion; nor does a returned user.
    if (afterDelete.data.user) {
      failures.push("identity still exists after a successful delete");
    } else if (afterDelete.error && afterDelete.error.status !== 404) {
      failures.push("verify identity deletion: " + afterDelete.error.message);
    }
  }
  if (userError) {
    // An earlier delete may have succeeded before its HTTP response was lost.
    // Check the actual account instead of reporting a false leak or deleting a different user.
    const lookup = await retryTransientDb(() => admin.auth.admin.getUserById(identity.userId));
    if (lookup.data.user || (lookup.error && lookup.error.status !== 404)) {
      failures.push("delete identity: " + userError.message);
    }
  }

  const { error: profileDeleteError } = await retryTransientDb(
    () => admin.from("profiles").delete().eq("id", identity.userId),
  );
  if (profileDeleteError) failures.push("delete profile: " + profileDeleteError.message);
  const profileLeft = await retryTransientDb(
    () => admin.from("profiles").select("id").eq("id", identity.userId),
  );
  if (profileLeft.error) {
    failures.push("verify profile: " + profileLeft.error.message);
  } else if ((profileLeft.data ?? []).length > 0) {
    failures.push("profile remains after cleanup");
  }
  if (auditFailure) failures.push(auditFailure);

  if (failures.length > 0) {
    throw new Error("cleanup failed for " + identity.email + " — " + failures.join("; "));
  }
}

/**
 * Mint a real Supabase session for a test user via admin magic-link → verifyOtp.
 * Retries to absorb magic-link flakiness. Never logs key values.
 */
export async function getTestSession(
  email = QA_HOST_EMAIL,
  options: { requireExisting?: boolean } = {},
): Promise<Session> {
  const { url, anon } = supabaseEnv();
  if (!url || !anon) {
    throw new Error("E2E Supabase env missing (url/anon)");
  }
  const admin = await getSupabaseAdmin();

  // Supabase generateLink(magiclink) may create missing users. Never let a
  // permanent QA identity be silently provisioned by a test. Disposable
  // qa-isolation.mdeai.co users are provisioned explicitly elsewhere.
  const normalizedEmail = email.trim().toLowerCase();
  // Prefix/suffix checks are sufficient here: this is an existing-user safety
  // guard, not email validation. Avoid regex analysis noise on QA input.
  const fixedQaEmail = normalizedEmail === QA_SUPER_ADMIN_EMAIL ||
    (normalizedEmail.startsWith("qa-") && normalizedEmail.endsWith("@mdeai.co"));
  if (options.requireExisting || fixedQaEmail) {
    let page = 1;
    let found = false;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw new Error(`QA account lookup failed: ${error.message}`);
      found = data.users.some((user) => user.email?.toLowerCase() === normalizedEmail);
      if (found || !data.nextPage) break;
      page = data.nextPage;
    }
    if (!found) {
      throw new Error(`Existing QA account ${normalizedEmail} not found; refusing magic-link auto-creation`);
    }
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anon);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
      });
      if (linkErr) throw linkErr;
      const otp = link?.properties?.email_otp;
      if (!otp) throw new Error("missing email_otp from generateLink");
      const { data, error } = await client.auth.verifyOtp({
        email: normalizedEmail,
        token: otp,
        type: "email",
      });
      if (error || !data.session) throw error ?? new Error("no session from verifyOtp");
      return data.session;
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("getTestSession failed");
}

/** Cookie scope for the session cookie — local dev server vs a real deployed host. */
export type SessionCookieTarget = { host: string; secure: boolean };

const LOCAL_COOKIE_TARGET: SessionCookieTarget = { host: "localhost", secure: false };

/** Inject a Supabase session as the `sb-<ref>-auth-token` cookie (clears cookies first). */
export async function injectSession(
  context: BrowserContext,
  session: Session,
  target: SessionCookieTarget = LOCAL_COOKIE_TARGET,
): Promise<void> {
  const { url } = supabaseEnv();
  const ref = new URL(url!).hostname.split(".")[0];
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: "bearer",
    user: session.user,
  });
  await context.clearCookies();
  await context.addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: payload,
      domain: target.host,
      path: "/",
      httpOnly: false,
      secure: target.secure,
      sameSite: "Lax",
    },
  ]);
}

/** Sign a page's context in as `email` and return the session. */
export async function signInAs(
  page: Page,
  email = QA_HOST_EMAIL,
): Promise<Session> {
  const session = await getTestSession(email);
  await injectSession(page.context(), session);
  return session;
}

/**
 * Sign a page in against an explicit origin (e.g. the deployed production URL).
 *
 * Uses the same dedicated QA account as `signInAs` and mints a real Supabase
 * session through the admin API — no `E2E_BYPASS_AUTH`, so production
 * authentication is never weakened. The cookie is scoped to the origin's host
 * and marked `secure` for https targets.
 */
export async function signInAsOnOrigin(
  page: Page,
  origin: string,
  email = QA_HOST_EMAIL,
  options: { requireExisting?: boolean } = {},
): Promise<Session> {
  // Accept a bare host as well as a full origin; default to https.
  const parsed = new URL(origin.includes("://") ? origin : `https://${origin}`);
  const session = await getTestSession(email, options);
  await injectSession(page.context(), session, {
    host: parsed.hostname,
    secure: parsed.protocol === "https:",
  });
  return session;
}
