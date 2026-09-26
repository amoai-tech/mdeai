#!/usr/bin/env node
/**
 * Warn when a local dev/test process is handed a remote DATABASE_URL.
 *
 * `shouldUsePostgresStorage()` (src/mastra/lib/storage.ts) selects Postgres whenever
 * DATABASE_URL is non-empty and NODE_ENV is not "production". A local run that points it
 * at a hosted database therefore builds a real PostgresStore against that host: it either
 * fails with an opaque network error, or connects and reads/writes hosted data.
 *
 * This guard is deliberately a warning, never a gate:
 *   - it always exits 0, so it cannot fail a build or a test run;
 *   - it stays silent under CI, so workflows that intentionally inject a remote
 *     DATABASE_URL (.github/workflows/veb-mvp-010-integration.yml) are unaffected;
 *   - it prints only the host, never the connection string, so credentials cannot leak.
 *
 * Usage:
 *   node scripts/warn-remote-database-url.mjs
 *   import { warnIfRemoteDatabaseUrl } from "./warn-remote-database-url.mjs"
 */

import { isIPv4 } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Loopback and container-development hostnames that never name a remote database. */
const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::",
  "::1",
  "host.docker.internal",
  "host.containers.internal",
  "gateway.docker.internal",
]);

/** Environment markers identifying a CI runner or an already-deployed runtime. */
const CI_MARKERS = [
  "CI",
  "GITHUB_ACTIONS",
  "VERCEL",
  "NETLIFY",
  "BUILDKITE",
  "CIRCLECI",
  "GITLAB_CI",
  "TF_BUILD",
  "TEAMCITY_VERSION",
  "JENKINS_URL",
];

/**
 * The Supabase direct-connection host shape. `.env.example` forbids it for IPv4 networks
 * because it is IPv6-only, and it addresses the same production database.
 */
const DIRECT_SUPABASE_HOST = /^db\.[a-z0-9-]+\.supabase\.(?:co|in)$/i;

/** Remedies, ordered from most local to least. Mirrors the guidance in .env.example. */
const REMEDIES = [
  "local Supabase   — the DB URL printed by `supabase status` (host 127.0.0.1)",
  "in-memory LibSQL — leave DATABASE_URL unset and set MASTRA_DEV_LIBSQL=1",
  "Supabase pooler  — postgresql://postgres.<ref>:<pw>@aws-1-<region>.pooler.supabase.com:6543/postgres",
];

/**
 * Whether an environment value reads as "on". CI systems disagree on the encoding, and
 * `CI=false` is a common way to opt out, so only an explicit negative counts as off.
 * @param {string | undefined} value - the raw environment value.
 * @returns {boolean} true when the value is set to something other than a negative form.
 */
function isTruthyFlag(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return !["", "0", "false", "no", "off"].includes(normalized);
}

/**
 * Whether this process looks like CI or a deployed runtime rather than a local run.
 * @param {Record<string, string | undefined>} [env] - the environment to inspect.
 * @returns {boolean} true when the run should stay silent.
 */
function isCiEnvironment(env = process.env) {
  return CI_MARKERS.some((name) => isTruthyFlag(env?.[name]));
}

/**
 * Trim and unwrap a connection string the same way storage.ts does, so the guard and the
 * storage selection agree about what counts as "set".
 * @param {unknown} raw - the raw DATABASE_URL value.
 * @returns {string | null} the usable connection string, or null when unset/blank.
 */
function normalizeDatabaseUrl(raw) {
  if (typeof raw !== "string") return null;
  return raw.trim().replace(/^"|"$/g, "").trim() || null;
}

/**
 * Whether a hostname names the local machine or a container-forwarded dev port.
 * @param {string} hostname - the parsed URL hostname.
 * @returns {boolean} true when the host is local (an empty host means a unix socket).
 */
function isLocalHostname(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTNAMES.has(host)) return true;
  // All of 127.0.0.0/8 is loopback, but only a real IPv4 literal counts: a DNS name such
  // as `127.example.com` merely starts with those characters.
  if (isIPv4(host) && host.startsWith("127.")) return true;
  // `.localhost` is reserved to resolve to loopback (RFC 6761). `.local` is not — it is an
  // mDNS naming convention that split DNS can point at any host — so it earns no exemption.
  if (host.endsWith(".localhost")) return true;
  return false;
}

/**
 * Whether a hostname is the Supabase direct host, which is IPv6-only and production.
 * @param {string} hostname - the parsed URL hostname.
 * @returns {boolean} true for the `db.<ref>.supabase.co` shape.
 */
function isDirectSupabaseHost(hostname) {
  return DIRECT_SUPABASE_HOST.test(hostname ?? "");
}

/**
 * Decide whether a DATABASE_URL value should produce a warning.
 * @param {unknown} rawValue - the raw DATABASE_URL value.
 * @param {Record<string, string | undefined>} [env] - the environment to inspect.
 * @returns {{ warn: boolean, reason: string, hostname?: string, port?: string, directSupabase?: boolean }}
 *   the decision plus the host detail needed to describe it.
 */
function evaluateDatabaseUrl(rawValue, env = process.env) {
  const connectionString = normalizeDatabaseUrl(rawValue);
  if (!connectionString) return { warn: false, reason: "absent" };

  // A deployed runtime legitimately uses a remote database.
  if ((env?.NODE_ENV ?? "").trim() === "production") {
    return { warn: false, reason: "production-runtime" };
  }
  // CI may inject a remote URL on purpose; never add noise there.
  if (isCiEnvironment(env)) return { warn: false, reason: "ci" };

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    // A value the URL parser rejects cannot be judged by host; stay quiet rather than guess.
    return { warn: false, reason: "unparseable" };
  }

  const hostname = parsed.hostname ?? "";
  if (isLocalHostname(hostname)) return { warn: false, reason: "local" };

  return {
    warn: true,
    reason: "remote",
    hostname,
    port: parsed.port || "",
    directSupabase: isDirectSupabaseHost(hostname),
  };
}

/**
 * Render the warning for a decided result. Never includes the connection string.
 * @param {{ hostname: string, port: string, directSupabase: boolean }} result - an evaluate() result with warn=true.
 * @returns {string} the multi-line warning body, without a trailing newline.
 */
function formatDatabaseWarning(result) {
  const target = result.port ? `${result.hostname}:${result.port}` : result.hostname;
  const lines = [];
  if (result.directSupabase) {
    lines.push(
      `⚠  DATABASE_URL uses the Supabase DIRECT host (${target}) during a local dev/test run.`,
      "   That host is production and IPv6-only: on an IPv4-only machine it fails with",
      "   ENETUNREACH, and on an IPv6-capable machine it connects to production data.",
    );
  } else {
    lines.push(
      `⚠  DATABASE_URL points at a REMOTE host (${target}) during a local dev/test run.`,
      "   Mastra storage will use it, so a local run can read or write hosted data.",
    );
  }
  lines.push("   Prefer one of:");
  for (const remedy of REMEDIES) lines.push(`     • ${remedy}`);
  lines.push("   Set CI=true to silence this warning.");
  return lines.join("\n");
}

/**
 * Warn on stderr when a local run has a remote DATABASE_URL. Never throws and never
 * changes the exit code, so callers may use it on any dev/test path.
 * @param {{ env?: Record<string, string | undefined>, write?: (text: string) => void }} [options]
 *   - `env` overrides the environment (tests); `write` overrides the output sink.
 * @returns {string | null} the warning that was written, or null when nothing was written.
 */
export function warnIfRemoteDatabaseUrl(options = {}) {
  const env = options.env ?? process.env;
  const write = options.write ?? ((text) => process.stderr.write(text));
  try {
    const result = evaluateDatabaseUrl(env?.DATABASE_URL, env);
    if (!result.warn) return null;
    const message = formatDatabaseWarning(result);
    write(`${message}\n`);
    return message;
  } catch {
    // A guard must never break the run it guards.
    return null;
  }
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  warnIfRemoteDatabaseUrl();
  process.exitCode = 0;
}
