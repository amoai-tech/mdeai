import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMastraStorage,
  getMastraStorage,
  POSTGRES_IDLE_TIMEOUT_MS,
  POSTGRES_POOL_MAX,
  resetMastraStorageForTests,
  resolveRuntimeConnectionString,
  shouldUsePostgresStorage,
} from "./storage";

type PooledStore = { pool: { options: { max: number; idleTimeoutMillis: number; ssl: unknown } } };

describe("resolveRuntimeConnectionString", () => {
  it("strips sslmode so a URL cannot force plaintext", () => {
    expect(resolveRuntimeConnectionString("postgresql://u:p@h:6543/db?sslmode=disable")).toBe(
      "postgresql://u:p@h:6543/db",
    );
  });

  it("strips ssl and keeps unrelated parameters", () => {
    expect(
      resolveRuntimeConnectionString(
        "postgresql://u:p@h:6543/db?sslmode=require&application_name=x&ssl=true",
      ),
    ).toBe("postgresql://u:p@h:6543/db?application_name=x");
  });

  it("leaves a URL with no SSL parameters unchanged", () => {
    expect(resolveRuntimeConnectionString("postgresql://u:p@h:6543/db?application_name=x")).toBe(
      "postgresql://u:p@h:6543/db?application_name=x",
    );
  });
});

describe("createMastraStorage", () => {
  afterEach(() => {
    resetMastraStorageForTests();
    vi.unstubAllEnvs();
  });

  it("uses PostgresStore when DATABASE_URL is set", () => {
    vi.stubEnv("MASTRA_DEV_LIBSQL", "");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres.test:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
    );
    const store = createMastraStorage("test-pg");
    expect(store.constructor.name).toBe("PostgresStore");
  });

  it("uses in-memory LibSQL when DATABASE_URL is absent in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "");
    const store = createMastraStorage("test-mem");
    expect(store.constructor.name).toBe("LibSQLStore");
  });

  it("fails closed when DATABASE_URL is absent in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => createMastraStorage("test-prod-missing-db")).toThrow(
      "DATABASE_URL is required in production",
    );
  });

  it("production forces TLS and the measured pool even when the URL says sslmode=disable", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@h:6543/db?sslmode=disable");
    const store = createMastraStorage("test-tls") as unknown as PooledStore;
    expect(store.pool.options.ssl).toEqual({ rejectUnauthorized: false });
    expect(store.pool.options.max).toBe(POSTGRES_POOL_MAX);
    expect(store.pool.options.idleTimeoutMillis).toBe(POSTGRES_IDLE_TIMEOUT_MS);
  });

  it("development does not force TLS on a local database", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MASTRA_DEV_LIBSQL", "");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:5432/db");
    const store = createMastraStorage("test-dev-pg") as unknown as PooledStore;
    expect(store.pool.options.ssl).toBeUndefined();
  });

  it("fails closed when DATABASE_URL is whitespace-only in production", () => {
    // Regression: normalizeDatabaseUrl used to return the untrimmed whitespace string,
    // which passed the presence check and built a PostgresStore from an invalid URL.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "   ");
    expect(() => createMastraStorage("test-prod-blank-db")).toThrow(
      "DATABASE_URL is required in production",
    );
  });

  it("fails closed when DATABASE_URL normalises to empty quotes in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", '""');
    expect(() => createMastraStorage("test-prod-quoted-blank")).toThrow(
      "DATABASE_URL is required in production",
    );
  });

  it("trims a padded, quote-wrapped DATABASE_URL and still selects Postgres", () => {
    vi.stubEnv("MASTRA_DEV_LIBSQL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "DATABASE_URL",
      '  "postgresql://postgres.test:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres"  ',
    );
    const store = createMastraStorage("test-padded-db");
    expect(store.constructor.name).toBe("PostgresStore");
  });

  it("uses ephemeral storage during the Next production build without DATABASE_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("DATABASE_URL", "");
    const store = createMastraStorage("test-build");
    expect(store.constructor.name).toBe("LibSQLStore");
  });

  it("logs postgres mode when DATABASE_URL is set", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("MASTRA_DEV_LIBSQL", "");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres.test:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
    );
    getMastraStorage();
    expect(info).toHaveBeenCalledWith("[mastra-storage] using Postgres");
    info.mockRestore();
  });

  it("logs libsql dev mode when DATABASE_URL is absent", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "");
    getMastraStorage();
    expect(info).toHaveBeenCalledWith("[mastra-storage] using local dev LibSQL");
    info.mockRestore();
  });

  it("uses LibSQL when MASTRA_DEV_LIBSQL=1 even if DATABASE_URL is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MASTRA_DEV_LIBSQL", "1");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres.test:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
    );
    expect(shouldUsePostgresStorage()).toBe(false);
    const store = createMastraStorage("test-dev-libsql");
    expect(store.constructor.name).toBe("LibSQLStore");
  });

  it("uses Postgres when NODE_ENV=production even if MASTRA_DEV_LIBSQL=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MASTRA_DEV_LIBSQL", "1");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://postgres.test:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
    );
    expect(shouldUsePostgresStorage()).toBe(true);
    const store = createMastraStorage("test-prod-override");
    expect(store.constructor.name).toBe("PostgresStore");
  });
});
