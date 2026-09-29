#!/usr/bin/env node
/**
 * Fail closed when a local E2E browser command would run against a hosted Supabase backend.
 *
 * The problem this removes
 * ------------------------
 * `npm run test:e2e:p0-focused` boots `next dev`, which loads `.env` / `.env.local`. When the
 * resolved Supabase URL names a hosted project, a command that reads like a test creates REAL
 * rows in `mastra_threads`, `mastra_messages` and `ai_runs`. The operator sees a green local
 * run while the customer's project carries the writes.
 *
 * Contract — deliberately the opposite of `scripts/warn-remote-database-url.mjs`, which is a
 * warning that always exits 0. This guard refuses to start:
 *
 *   absent URL ................................ allow   (deterministic mode needs no backend)
 *   loopback / local host ..................... allow   (local Supabase via `supabase start`)
 *   unparseable URL ........................... REFUSE  (cannot prove it is local)
 *   remote host ............................... REFUSE  (exit 1)
 *   remote host + ALLOW_PROD_CERTIFICATION=1 .. allow, loudly
 *
 * The override exists so an intentional production certification can still run. It is a
 * separate, explicit, all-caps variable so it cannot be set by accident and never appears in a
 * committed `.env` (the E2E test asserts that).
 *
 * Resolution order mirrors the application rather than guessing:
 * `src/lib/supabase/server-env.ts` resolves `SUPABASE_URL` BEFORE `NEXT_PUBLIC_SUPABASE_URL`.
 * Guarding only the public variable would leave a real hole for an operator who set the other.
 *
 * It prints the host and nothing else — never the key, never the full URL.
 *
 * Usage:
 *   node scripts/require-safe-e2e-backend.mjs
 *   import { requireSafeE2eBackend } from "./require-safe-e2e-backend.mjs"
 */

import nextEnv from "@next/env";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLocalHostname } from "./warn-remote-database-url.mjs";

const { loadEnvConfig } = nextEnv;

/** Explicit, all-caps opt-in that permits a remote backend. */
export const PROD_CERTIFICATION_OVERRIDE = "ALLOW_PROD_CERTIFICATION";

/**
 * Supabase URL variables in the same precedence the application uses. `SUPABASE_URL` first,
 * because `server-env.ts` prefers it and a later entry only applies when the earlier is blank.
 */
export const SUPABASE_URL_VARS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];

/** Quiet logger for @next/env; this guard owns all user-facing output. */
const NEXT_ENV_LOGGER = {
  info: () => {},
  error: () => {},
};

/**
 * Whether an environment value reads as "on". Mirrors the convention already used by
 * `warn-remote-database-url.mjs` so `ALLOW_PROD_CERTIFICATION=0` is understood as off.
 * @param {unknown} value - the raw environment value.
 * @returns {boolean} true when the value is set to something other than a negative form.
 */
function isTruthyFlag(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return !["", "0", "false", "no", "off"].includes(normalized);
}

/**
 * Trim and unwrap a URL the way the app's `firstPresent` treats a blank value, so the guard and
 * the client agree about what counts as "set".
 * @param {unknown} raw - the raw environment value.
 * @returns {string | null} the usable URL, or null when unset/blank.
 */
function normalizeUrl(raw) {
  if (typeof raw !== "string") return null;
  return raw.trim().replace(/^"|"$/g, "").trim() || null;
}

/**
 * Pick the Supabase URL the application would actually use.
 * @param {Record<string, string | undefined>} env - the environment to inspect.
 * @returns {{ name: string, value: string } | null} the winning variable, or null when unset.
 */
export function resolveSupabaseTarget(env = process.env) {
  for (const name of SUPABASE_URL_VARS) {
    const value = normalizeUrl(env?.[name]);
    if (value) return { name, value };
  }
  return null;
}

/**
 * Decide whether a Supabase URL is safe for a local E2E run.
 *
 * An unparseable value is refused rather than allowed: this guard exists to prevent writes to
 * an unknown target, so "cannot tell" must resolve to "do not run", not "probably fine".
 *
 * @param {string | null} rawUrl - the resolved Supabase URL, or null when unset.
 * @param {Record<string, string | undefined>} [env] - the environment to inspect.
 * @returns {{ allowed: boolean, reason: string, hostname?: string, override: boolean }}
 *   the decision plus the host detail needed to describe it.
 */
export function evaluateE2eBackend(rawUrl, env = process.env) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { allowed: true, reason: "absent", override: false };

  const override = isTruthyFlag(env?.[PROD_CERTIFICATION_OVERRIDE]);

  let hostname;
  let protocol;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname ?? "";
    protocol = parsed.protocol;
  } catch {
    return { allowed: false, reason: "unparseable", override };
  }

  // A Supabase URL is always HTTP(S) over a real host, so anything else is refused rather than
  // read as local. This check cannot live in `isLocalHostname`: that predicate deliberately
  // treats an empty host as local, because a Postgres connection string may legitimately name a
  // unix socket. Reusing it unguarded let `file:///tmp/x` — which has no host — read as local.
  if ((protocol !== "http:" && protocol !== "https:") || !hostname) {
    return { allowed: false, reason: "unparseable", override };
  }

  if (isLocalHostname(hostname)) {
    return { allowed: true, reason: "local", hostname, override };
  }

  return {
    allowed: override,
    reason: override ? "remote-override" : "remote",
    hostname,
    override,
  };
}

/**
 * Render the refusal. Never includes a key or the full URL.
 * @param {{ hostname?: string }} result - an evaluate() result with allowed=false.
 * @param {string} variableName - the environment variable the value came from.
 * @returns {string} the multi-line message body, without a trailing newline.
 */
export function formatRefusal(result, variableName) {
  return [
    `✖  Refusing to start: ${variableName} points at a REMOTE Supabase project (${result.hostname ?? "unknown host"}).`,
    "   This command boots the app and exercises real chat turns, so a remote target means",
    "   real rows in mastra_threads / mastra_messages / ai_runs — not test data.",
    "   Prefer one of:",
    "     • local Supabase — `supabase start`, then use the URL it prints (host 127.0.0.1)",
    "     • deterministic mode — `npm run test:e2e:deterministic` (mocked, no hosted backend)",
    "   To certify a remote target on purpose, re-run with ALLOW_PROD_CERTIFICATION=1.",
  ].join("\n");
}

/**
 * Render the acknowledgement printed when the override permits a remote target.
 * @param {{ hostname?: string }} result - an evaluate() result with reason="remote-override".
 * @param {string} variableName - the environment variable the value came from.
 * @returns {string} the one-line notice.
 */
export function formatOverrideNotice(result, variableName) {
  return (
    `⚠  ALLOW_PROD_CERTIFICATION is set: running against REMOTE Supabase (${result.hostname ?? "unknown host"}) ` +
    `from ${variableName}. This run may write to a real project.`
  );
}

/**
 * Decide and report. Pure with respect to the environment it is handed: file loading happens in
 * the CLI path only, so imported callers and tests stay deterministic.
 *
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   write?: (text: string) => void,
 *   supabaseUrl?: string | null,
 *   supabaseUrlName?: string,
 * }} [options] - environment/sink overrides, plus an already-resolved URL for CLI callers.
 * @returns {{ allowed: boolean, reason: string, message: string | null }}
 *   the decision and the text that was written, if any.
 */
export function requireSafeE2eBackend(options = {}) {
  const env = options.env ?? process.env;
  const write = options.write ?? ((text) => process.stderr.write(text));

  const target = Object.prototype.hasOwnProperty.call(options, "supabaseUrl")
    ? { name: options.supabaseUrlName ?? "supabaseUrl", value: options.supabaseUrl ?? "" }
    : resolveSupabaseTarget(env);

  const result = evaluateE2eBackend(target?.value ?? null, env);

  if (result.reason === "remote-override") {
    const notice = formatOverrideNotice(result, target?.name ?? "Supabase URL");
    write(`${notice}\n`);
    return { allowed: true, reason: result.reason, message: notice };
  }
  if (!result.allowed) {
    const message = formatRefusal(result, target?.name ?? "Supabase URL");
    write(`${message}\n`);
    return { allowed: false, reason: result.reason, message };
  }
  return { allowed: true, reason: result.reason, message: null };
}

/**
 * Resolve the Supabase URL with the same loader `next dev` uses. Used only by the short-lived
 * CLI process, so @next/env may populate that process without affecting the parent shell or the
 * dev server Next.js later starts.
 * @param {string} cwd - project directory containing `.env*` files.
 * @returns {{ target: { name: string, value: string } | null, env: Record<string, string | undefined> }}
 *   the winning variable and the effective environment.
 */
function resolveWithNextEnv(cwd) {
  const { combinedEnv } = loadEnvConfig(cwd, true, NEXT_ENV_LOGGER, true);
  return { target: resolveSupabaseTarget(combinedEnv), env: combinedEnv };
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const ambientEnv = { ...process.env };
  let resolved;
  if (process.argv.includes("--no-env-files")) {
    resolved = { target: resolveSupabaseTarget(ambientEnv), env: ambientEnv };
  } else {
    try {
      resolved = resolveWithNextEnv(process.cwd());
    } catch {
      // If the dotenv files cannot be read, judge only what the caller exported. The remote
      // check still fails closed for an explicitly exported URL.
      resolved = { target: resolveSupabaseTarget(ambientEnv), env: ambientEnv };
    }
  }
  const decision = requireSafeE2eBackend({
    env: resolved.env,
    supabaseUrl: resolved.target?.value ?? null,
    supabaseUrlName: resolved.target?.name,
  });
  process.exitCode = decision.allowed ? 0 : 1;
}
