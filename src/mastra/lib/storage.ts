/**
 * Mastra storage — Postgres on Vercel/prod (DATABASE_URL), in-memory LibSQL locally.
 * Never use `file:` LibSQL on serverless (read-only FS → ConnectionFailed).
 *
 * Local dev: set MASTRA_DEV_LIBSQL=1 to avoid Supabase pooler EMAXCONN when Next +
 * Mastra dev restart often (each HMR can orphan a PostgresStore pool until limit 200).
 */
import { LibSQLStore } from "@mastra/libsql";
import { PostgresStore } from "@mastra/pg";

const storageGlobalKey = "__mdeaiMastraStorage";

type StorageSingleton = {
  store: ReturnType<typeof createMastraStorage>;
  modeLogged: boolean;
};

function getStorageGlobal(): StorageSingleton | undefined {
  return (globalThis as Record<string, unknown>)[storageGlobalKey] as
    | StorageSingleton
    | undefined;
}

function setStorageGlobal(value: StorageSingleton | undefined) {
  if (value === undefined) {
    delete (globalThis as Record<string, unknown>)[storageGlobalKey];
    return;
  }
  (globalThis as Record<string, unknown>)[storageGlobalKey] = value;
}

function normalizeDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  // Order matters: trim first, then strip wrapping quotes, then trim again. Stripping
  // quotes first would leave them in place for a padded value like `  "postgres://…"  `.
  //
  // An empty/whitespace-only result is treated as *missing* rather than as a value:
  // DATABASE_URL="   " is a misconfiguration, and passing it through would hand
  // PostgresStore an invalid connection string instead of failing closed with the
  // intended "DATABASE_URL is required in production" error.
  const unquoted = raw.trim().replace(/^"|"$/g, "");
  return unquoted.trim() || undefined;
}

/**
 * Pool size and TLS strategy for the production Postgres path.
 *
 * Fluid Compute is ENABLED on the production Vercel project (verified from the project
 * API: defaultResourceConfig.fluid === true), so Supabase's conventional serverless
 * `max: 1` is too small for concurrent warm-instance traffic. 3 is the smallest value
 * that keeps concurrent Mastra storage operations from queueing while staying far below
 * the Supabase pooler limit. See SAN-1303 evidence.
 */
export const POSTGRES_POOL_MAX = 3;
export const POSTGRES_IDLE_TIMEOUT_MS = 10_000;

/**
 * Force TLS for the runtime Postgres connection.
 *
 * node-postgres lets the connection string's `sslmode`/`ssl` parameters override an
 * explicit `ssl` option, so a Dashboard-issued URL with `sslmode=disable` would
 * silently downgrade production traffic to plaintext (measured: the production URL has
 * no sslmode and connected with client_ssl=none). Removing those parameters makes the
 * `ssl` object below the single source of truth, so plaintext is impossible regardless
 * of the URL. Supabase's pooler presents a chain node-postgres does not trust by
 * default, so encryption is required without CA verification (equivalent to
 * sslmode=require); `verify-full` is deferred until the Supabase CA is provisioned.
 */
/** Loopback/local hosts that legitimately do not offer TLS. Everything else must. */
export function isLocalDatabaseHost(hostname: string): boolean {
  const host = hostname.trim().replace(/^\[|\]$/g, "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

/** True unless the connection target is a local host. */
export function shouldRequireTls(connectionString: string): boolean {
  try {
    return !isLocalDatabaseHost(new URL(connectionString).hostname);
  } catch {
    return true;
  }
}

export function resolveRuntimeConnectionString(connectionString: string): string {
  const [base, query] = connectionString.split("?", 2);
  if (!query) return connectionString;
  const kept = query.split("&").filter((part) => {
    const key = part.split("=")[0].toLowerCase();
    return key !== "sslmode" && key !== "ssl";
  });
  return kept.length > 0 ? `${base}?${kept.join("&")}` : base;
}

/** Next sets this while collecting/building routes; runtime requests never do. */
export function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** True when Mastra thread memory should use Supabase Postgres at runtime. */
export function shouldUsePostgresStorage(): boolean {
  if (isNextProductionBuild()) return false;
  const connectionString = normalizeDatabaseUrl();
  if (!connectionString) return false;
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.MASTRA_DEV_LIBSQL === "1") return false;
  return true;
}

export function createMastraStorage(id: string) {
  if (isNextProductionBuild()) {
    return new LibSQLStore({ id, url: ":memory:" });
  }
  if (process.env.NODE_ENV === "production" && !normalizeDatabaseUrl()) {
    throw new Error("DATABASE_URL is required in production");
  }
  if (shouldUsePostgresStorage()) {
    const connectionString = normalizeDatabaseUrl();
    // Encrypt every non-local database connection. Production is the Supabase pooler,
    // so this always applies there; loopback (local dev and the disposable integration
    // databases) stays plaintext because those servers do not offer TLS. The URL is
    // passed through resolveRuntimeConnectionString so it cannot disable TLS.
    const requireTls = shouldRequireTls(connectionString!);
    return new PostgresStore({
      id,
      connectionString: requireTls
        ? resolveRuntimeConnectionString(connectionString!)
        : connectionString!,
      ...(requireTls ? { ssl: { rejectUnauthorized: false } } : {}),
      max: POSTGRES_POOL_MAX,
      idleTimeoutMillis: POSTGRES_IDLE_TIMEOUT_MS,
      disableInit: true,
    });
  }
  return new LibSQLStore({ id, url: ":memory:" });
}

let sharedStorage: ReturnType<typeof createMastraStorage> | undefined;
let storageModeLogged = false;

function logStorageMode(mode: "postgres" | "libsql-dev" | "libsql-build") {
  const bucket = getStorageGlobal();
  if (bucket?.modeLogged || storageModeLogged) return;
  storageModeLogged = true;
  if (bucket) bucket.modeLogged = true;
  if (mode === "postgres") {
    console.info("[mastra-storage] using Postgres");
  } else if (mode === "libsql-build") {
    console.info("[mastra-storage] using ephemeral build storage");
  } else {
    console.info("[mastra-storage] using local dev LibSQL");
  }
}

/** Singleton storage for Mastra core + agent thread memory (survives Next dev HMR). */
export function getMastraStorage() {
  const cached = getStorageGlobal();
  if (cached?.store) {
    sharedStorage = cached.store;
    storageModeLogged = cached.modeLogged;
    return cached.store;
  }
  if (!sharedStorage) {
    const mode = isNextProductionBuild()
      ? "libsql-build"
      : shouldUsePostgresStorage()
        ? "postgres"
        : "libsql-dev";
    sharedStorage = createMastraStorage("mastra-storage");
    setStorageGlobal({ store: sharedStorage, modeLogged: false });
    logStorageMode(mode);
  }
  return sharedStorage;
}

/** Test helper — reset singleton between Vitest cases. */
export function resetMastraStorageForTests() {
  sharedStorage = undefined;
  storageModeLogged = false;
  setStorageGlobal(undefined);
}

/** Close Postgres pool then reset — use in integration tests to avoid pooler EMAXCONN. */
export async function closeMastraStorageForTests(): Promise<void> {
  const store = getStorageGlobal()?.store ?? sharedStorage;
  if (store?.constructor.name === "PostgresStore" && "close" in store) {
    await (store as PostgresStore).close();
  }
  resetMastraStorageForTests();
}
