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

/**
 * Delete a throwaway identity, its durable AI memory, and — unlike the auth
 * delete alone — every thread/message the run created under it.
 *
 * `mastra_messages` has no foreign key to `mastra_threads`, so the messages are
 * removed explicitly before the threads. Callers must still re-query afterwards
 * to prove the rows are gone rather than assuming this succeeded.
 */
export async function deleteThrowawayIdentity(identity: ThrowawayIdentity): Promise<void> {
  const admin = await getSupabaseAdmin();
  const { data: threads } = await admin
    .from("mastra_threads")
    .select("id")
    .eq("resourceId", identity.userId);
  const ids = (threads ?? []).map((row) => (row as { id: string }).id);
  if (ids.length > 0) {
    await admin.from("mastra_messages").delete().in("thread_id", ids);
    await admin.from("mastra_threads").delete().eq("resourceId", identity.userId);
  }
  await admin.auth.admin.deleteUser(identity.userId);
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
