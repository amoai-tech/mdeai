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
    return new PostgresStore({
      id,
      connectionString: connectionString!,
      max: 3,
      idleTimeoutMillis: 10_000,
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
