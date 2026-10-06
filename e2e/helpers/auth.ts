import type { BrowserContext, Page } from "@playwright/test";
import type { Session } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const QA_HOST_EMAIL = "qa-landlord@mdeai.co";

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

/** True only when the Supabase env required for authed e2e is present. */
export function hasE2eEnv(): boolean {
  const { url, anon, serviceKey } = supabaseEnv();
  return Boolean(url && anon && serviceKey);
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
    throw error ?? new Error(`createUser returned no user for ${label}`);
  }
  return { email, userId: data.user.id };
}

type AdminClient = Awaited<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Errors that only mean the vendor-owned Mastra tables are not provisioned here.
 *
 * The stable codes are authoritative. The message fallbacks are deliberately
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
 * (2026-10-02). Two identical consecutive reads count as settled.
 */
async function waitForSettledThreads(admin: AdminClient, userId: string, timeoutMs = 90_000): Promise<void> {
  const readCount = async (): Promise<number> => {
    const { data, error } = await admin.from("mastra_threads").select("id").eq("resourceId", userId);
    if (error) throw new Error("select threads: " + error.message);
    const ids = (data ?? []).map((row) => (row as { id: string }).id);
    if (ids.length === 0) return 0;
    const { count, error: countError } = await admin
      .from("mastra_messages")
      .select("id", { count: "exact", head: true })
      .in("thread_id", ids);
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

/**
 * Delete a throwaway identity, its durable AI memory, and — unlike the auth
 * delete alone — every thread/message the run created under it.
 *
 * Waits for late writes to settle first, then deletes and PROVES the rows are gone.
 * A partial cleanup throws instead of passing green: swallowing it here is what let
 * an earlier run leave orphaned messages behind.
 */
export async function deleteThrowawayIdentity(identity: ThrowawayIdentity): Promise<void> {
  const admin = await getSupabaseAdmin();
  const failures: string[] = [];

  // A local stack with no Mastra tables has no rows to clean, only the identity.
  const probe = await admin.from("mastra_threads").select("id").eq("resourceId", identity.userId);
  const mastraAbsent = isMissingMastraTable(probe.error);
  if (probe.error && !mastraAbsent) failures.push("select threads: " + probe.error.message);

  if (!mastraAbsent && failures.length === 0) {
    try {
      await waitForSettledThreads(admin, identity.userId);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }

    // Re-read AFTER settling: a turn that finished during the wait may have created a
    // new thread, and its messages must be removed too.
    const { data: threads, error: selectError } = await admin
      .from("mastra_threads")
      .select("id")
      .eq("resourceId", identity.userId);
    if (selectError && !isMissingMastraTable(selectError)) {
      failures.push("select threads: " + selectError.message);
    }
    const ids = (threads ?? []).map((row) => (row as { id: string }).id);

    if (ids.length > 0) {
      const { error: messagesError } = await admin.from("mastra_messages").delete().in("thread_id", ids);
      if (messagesError) failures.push("delete messages: " + messagesError.message);
    }

    const { error: threadsError } = await admin
      .from("mastra_threads")
      .delete()
      .eq("resourceId", identity.userId);
    if (threadsError) failures.push("delete threads: " + threadsError.message);

    // Prove the outcome rather than assume the deletes worked.
    const remaining = await admin.from("mastra_threads").select("id").eq("resourceId", identity.userId);
    if (remaining.error && !isMissingMastraTable(remaining.error)) {
      failures.push("verify threads: " + remaining.error.message);
    } else if ((remaining.data ?? []).length > 0) {
      failures.push("threads remain after cleanup: " + (remaining.data ?? []).length);
    }
    if (ids.length > 0) {
      const remainingMessages = await admin.from("mastra_messages").select("id").in("thread_id", ids);
      if (remainingMessages.error && !isMissingMastraTable(remainingMessages.error)) {
        failures.push("verify messages: " + remainingMessages.error.message);
      } else if ((remainingMessages.data ?? []).length > 0) {
        failures.push("messages remain after cleanup: " + (remainingMessages.data ?? []).length);
      }
    }
  }

  const { error: userError } = await admin.auth.admin.deleteUser(identity.userId);
  if (userError) failures.push("delete identity: " + userError.message);

  if (failures.length > 0) {
    throw new Error("cleanup failed for " + identity.email + " — " + failures.join("; "));
  }
}

/**
 * Mint a real Supabase session for a test user via admin magic-link → verifyOtp.
 * Retries to absorb magic-link flakiness. Never logs key values.
 */
export async function getTestSession(email = QA_HOST_EMAIL): Promise<Session> {
  const { url, anon } = supabaseEnv();
  if (!url || !anon) {
    throw new Error("E2E Supabase env missing (url/anon)");
  }
  const admin = await getSupabaseAdmin();
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anon);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (linkErr) throw linkErr;
      const otp = link?.properties?.email_otp;
      if (!otp) throw new Error("missing email_otp from generateLink");
      const { data, error } = await client.auth.verifyOtp({
        email,
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
): Promise<Session> {
  // Accept a bare host as well as a full origin; default to https.
  const parsed = new URL(origin.includes("://") ? origin : `https://${origin}`);
  const session = await getTestSession(email);
  await injectSession(page.context(), session, {
    host: parsed.hostname,
    secure: parsed.protocol === "https:",
  });
  return session;
}
