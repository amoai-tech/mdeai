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
 * Where the value comes from matters, so it is explicit rather than implicit:
 *   - CLI (`node scripts/warn-remote-database-url.mjs`) reads the dotenv files `next dev`
 *     would load, because a `predev` hook runs before Next does any env loading. Pass
 *     `--no-env-files` to skip that. Set `MDE_DATABASE_URL_GUARD_RUNNING=1` to suppress a
 *     duplicate report in a child script that a parent already guarded.
 *   - Imported (`warnIfRemoteDatabaseUrl()`) reads nothing by default: the Vitest process
 *     does not load `.env.local` into `process.env`, so reading it there would warn about a
 *     value the test run never actually uses. Pass `{ readEnvFiles: true }` to opt in.
 *
 * Usage:
 *   node scripts/warn-remote-database-url.mjs
 *   import { warnIfRemoteDatabaseUrl } from "./warn-remote-database-url.mjs"
 */

import { readFileSync } from "node:fs";
import { isIPv4 } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Marks a child dev script whose parent already ran the guard this invocation. */
const SUPPRESS_MARKER = "MDE_DATABASE_URL_GUARD_RUNNING";

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
 * Whether this process carries a truthy CI marker. A deployed runtime is a separate concern,
 * decided by `evaluateDatabaseUrl` from NODE_ENV — and NODE_ENV is also what actually decides
 * storage, so the two must not be conflated here.
 * @param {Record<string, string | undefined>} [env] - the environment to inspect.
 * @returns {boolean} true when a CI marker is set to a truthy value.
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
 * Canonicalize a parsed URL hostname: drop the brackets URL keeps around an IPv6 literal, the
 * optional root dot that makes a name fully qualified, and letter case. Without the root-dot
 * strip, `db.<ref>.supabase.co.` resolves to the same direct production database but would slip
 * past the direct-host pattern and lose the specific explanation.
 * @param {string} hostname - the parsed URL hostname.
 * @returns {string} the normalized hostname.
 */
function normalizeHostname(hostname) {
  return (hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

/**
 * Whether a hostname names the local machine or a container-forwarded dev port.
 * @param {string} hostname - the parsed URL hostname.
 * @returns {boolean} true when the host is local (an empty host means a unix socket).
 */
function isLocalHostname(hostname) {
  if (!hostname) return true;
  const host = normalizeHostname(hostname);
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
  return DIRECT_SUPABASE_HOST.test(normalizeHostname(hostname));
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

  const hostname = normalizeHostname(parsed.hostname ?? "");
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
 * @param {string} [source] - the dotenv file the value came from, when it did not come from the ambient environment.
 * @returns {string} the multi-line warning body, without a trailing newline.
 */
function formatDatabaseWarning(result, source) {
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
  if (source) {
    lines.push(`   Found in ${source}, which \`next dev\` loads automatically.`);
  }
  lines.push("   Prefer one of:");
  for (const remedy of REMEDIES) lines.push(`     • ${remedy}`);
  lines.push("   Set CI=true to silence this warning.");
  return lines.join("\n");
}

/** Dotenv files a local Next run would consult, highest precedence first. */
function envFileNames(nodeEnv) {
  const name = (nodeEnv ?? "").trim() || "development";
  return [
    `.env.${name}.local`,
    // Next skips `.env.local` when NODE_ENV is "test"; mirroring that keeps the two in step.
    ...(name === "test" ? [] : [".env.local"]),
    `.env.${name}`,
    ".env",
  ];
}

/**
 * `$NAME` and `${NAME}` references, the forms `@next/env` expands in dotenv values.
 *
 * This is a deliberate subset rather than an import of `@next/env`: that package is only a
 * transitive dependency of `next` (absent from our package.json), so depending on it directly
 * would break the moment Next relocates it. The subset is safe because anything it cannot
 * resolve stays literal and is reported rather than silently treated as absent.
 */
const REFERENCE_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Substitute references from `scope`, leaving any that are unknown in place so a later check can
 * still see them. Optionally records every referenced name in the same pass, which keeps the
 * pattern in exactly one place.
 * @param {string} value - the raw value.
 * @param {Record<string, string | undefined>} scope - the names available to expand.
 * @param {Set<string>} [referenced] - collects each referenced name, resolved or not.
 * @returns {string} the expanded value.
 */
function expandReferences(value, scope, referenced) {
  return value.replace(REFERENCE_PATTERN, (match, braced, bare) => {
    const name = braced ?? bare;
    referenced?.add(name);
    return scope[name] ?? match;
  });
}

/**
 * The variable names a value references, de-duplicated.
 * @param {unknown} value - the raw value.
 * @returns {string[]} the referenced names.
 */
function referenceNames(value) {
  const referenced = new Set();
  expandReferences(String(value), {}, referenced);
  return [...referenced];
}

/**
 * Parse a dotenv file into a name/value map. Deliberately minimal — the goal is to see the value
 * Next will load, not to reimplement dotenv.
 * @param {string} content - the file contents.
 * @returns {Map<string, string>} every assignment, with a repeated key resolving to the last one.
 */
function parseEnvFile(content) {
  const values = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) continue;
    const raw = match[2].trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(raw);
    // An unquoted `#` only starts a comment when whitespace precedes it; inside quotes it is data.
    values.set(match[1], (quoted ? quoted[2] : raw.replace(/\s+#.*$/, "")).trim());
  }
  return values;
}

/**
 * Read one variable out of one dotenv file, expanding references the way Next would.
 * @param {string} file - absolute path of the dotenv file.
 * @param {string} name - the variable name to find.
 * @param {Record<string, string | undefined>} ambient - the environment, for references the file does not define.
 * @returns {string | null} the value (`""` when the name is set but blank), or null when absent.
 */
function readEnvFileValue(file, name, ambient) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const values = parseEnvFile(content);
  if (!values.has(name)) return null;
  return expandReferences(values.get(name), { ...ambient, ...Object.fromEntries(values) });
}

/**
 * Resolve DATABASE_URL the way a local Next run would, when the ambient environment does not
 * define it at all. Reads files only and never mutates `process.env`, so importing this module
 * cannot change what the caller's own environment resolves to.
 * @param {Record<string, string | undefined>} env - the ambient environment, for NODE_ENV and references.
 * @param {string} cwd - the project directory whose dotenv files apply.
 * @returns {{ value: string, source: string } | undefined} the value and the file it came from.
 */
function resolveDatabaseUrlFromEnvFiles(env, cwd) {
  for (const name of envFileNames(env?.NODE_ENV)) {
    const value = readEnvFileValue(path.resolve(cwd, name), "DATABASE_URL", env ?? {});
    // The first file that *mentions* the key wins, even when it sets it blank — Next stops at
    // the highest-precedence file that defines it rather than merging lower layers.
    if (value !== null) return { value, source: name };
  }
  return undefined;
}

/**
 * Warn on stderr when a local run has a remote DATABASE_URL. Never throws and never
 * changes the exit code, so callers may use it on any dev/test path.
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   write?: (text: string) => void,
 *   readEnvFiles?: boolean,
 *   cwd?: string,
 * }} [options] - `env`/`write` override the environment and sink (tests); `readEnvFiles` opts
 *   into resolving the value from dotenv files, which only the `next dev` path should do;
 *   `cwd` sets the directory those files resolve against.
 * @returns {string | null} the warning that was written, or null when nothing was written.
 */
/**
 * Render the conservative warning for a file value that still holds an unresolved reference.
 * It names only the referenced variables — never the raw value, which could carry credentials.
 * @param {string} source - the dotenv file that defined the value.
 * @param {string} raw - the unexpanded value.
 * @returns {string} the multi-line warning body, without a trailing newline.
 */
function formatUnresolvedReferenceWarning(source, raw) {
  const names = referenceNames(raw).map((name) => `$${name}`).join(", ");
  return [
    `⚠  DATABASE_URL in ${source} references ${names}, which this guard could not resolve.`,
    "   It may point at a remote database, so treat it as one until you confirm otherwise.",
    "   Prefer one of:",
    ...REMEDIES.map((remedy) => `     • ${remedy}`),
    "   Set CI=true to silence this warning.",
  ].join("\n");
}

export function warnIfRemoteDatabaseUrl(options = {}) {
  const env = options.env ?? process.env;
  const write = options.write ?? ((text) => process.stderr.write(text));
  try {
    // A parent dev script that already reported this run must not be repeated by its children.
    if (isTruthyFlag(env?.[SUPPRESS_MARKER])) return null;

    let raw = env?.DATABASE_URL;
    let source;
    // Only fall back to files when the ambient variable is undefined, not merely blank: Next
    // never overrides an already-set variable, so a set-but-empty value means "use LibSQL".
    if (raw === undefined && options.readEnvFiles) {
      const found = resolveDatabaseUrlFromEnvFiles(env, options.cwd ?? process.cwd());
      if (found) {
        raw = found.value;
        source = found.source;
      }
    }

    const result = evaluateDatabaseUrl(raw, env);
    if (!result.warn) {
      // A file value holding a reference we could not expand cannot be classified. Staying
      // silent would hide a possible remote target, so report it rather than guess.
      if (source && result.reason === "unparseable" && referenceNames(raw).length > 0) {
        const unresolved = formatUnresolvedReferenceWarning(source, raw);
        write(`${unresolved}\n`);
        return unresolved;
      }
      return null;
    }
    const message = formatDatabaseWarning(result, source);
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
  // A `predev` hook runs before Next performs any env loading, so the CLI resolves the dotenv
  // files itself; `--no-env-files` restricts it to the ambient environment.
  warnIfRemoteDatabaseUrl({ readEnvFiles: !process.argv.includes("--no-env-files") });
  process.exitCode = 0;
}
