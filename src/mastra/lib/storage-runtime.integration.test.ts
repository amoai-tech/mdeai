/**
 * SAN-1303 — runtime Postgres proof against a production-equivalent (TLS) database.
 *
 * Opt-in and never run by `floor`, because it requires the production-equivalent
 * Supabase endpoint (a disposable plain Postgres has no TLS):
 *
 *   MASTRA_STORAGE_RUNTIME_INTEGRATION=1 DATABASE_URL=… \
 *   MASTRA_ALLOW_REMOTE_DB_HOST=<pooler host> \
 *   npx vitest run src/mastra/lib/storage-runtime.integration.test.ts
 *
 * It only issues read-only queries; it writes no rows.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { assertLoopbackDatabaseUrl, REMOTE_DB_HOST_PIN } from "./integration-db-guard";
import { closeMastraStorageForTests, createMastraStorage, POSTGRES_POOL_MAX } from "./storage";

const enabled = process.env.MASTRA_STORAGE_RUNTIME_INTEGRATION === "1";
const describeMaybe = enabled ? describe : describe.skip;

type PooledStore = {
  pool: {
    options: { ssl: unknown; max: number };
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
  };
};

describeMaybe("production storage runtime", () => {
  afterAll(async () => {
    await closeMastraStorageForTests();
    vi.unstubAllEnvs();
  });

  it("requires TLS, reconnects across close/recreate, and drains concurrent work", async () => {
    vi.stubEnv("NODE_ENV", "production");
    assertLoopbackDatabaseUrl(process.env.DATABASE_URL, "MASTRA_STORAGE_RUNTIME_INTEGRATION", {
      allowRemoteHostEnv: REMOTE_DB_HOST_PIN,
    });

    // 1. TLS is forced by the code, whatever the URL says.
    const store = createMastraStorage("san1303-runtime") as unknown as PooledStore;
    expect(store.pool.options.ssl).toEqual({ rejectUnauthorized: false });
    expect(store.pool.options.max).toBe(POSTGRES_POOL_MAX);
    await store.pool.query("select 1");

    // Client-side TLS is the direct proof; pg_stat_ssl covers the backend leg only.
    const ssl = await store.pool.query(
      "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
    );
    console.info("[san1303] ssl config set; pg_stat_ssl backend=" + JSON.stringify(ssl.rows[0]));

    // 2. close -> recreate -> reconnect, a few cycles.
    for (let cycle = 0; cycle < 3; cycle++) {
      await closeMastraStorageForTests();
      const reopened = createMastraStorage("san1303-runtime-" + cycle) as unknown as PooledStore;
      await reopened.pool.query("select 1");
    }

    // 3. Concurrent work through one warm store; pool settles, no leak.
    const active = createMastraStorage("san1303-concurrency") as unknown as PooledStore;
    let peakWaiting = 0;
    const samples: string[] = [];
    const work = Array.from({ length: 8 }, async () => {
      peakWaiting = Math.max(peakWaiting, active.pool.waitingCount);
      samples.push(active.pool.totalCount + "/" + active.pool.idleCount + "/" + active.pool.waitingCount);
      await active.pool.query("select pg_sleep(0.05)");
    });
    const results = await Promise.allSettled(work);
    const failed = results.filter((r) => r.status === "rejected");
    expect(failed).toHaveLength(0);
    // Let idle clients return.
    await new Promise((resolve) => setTimeout(resolve, 300));
    console.info(
      "[san1303] concurrency max=" + POSTGRES_POOL_MAX + " peakWaiting=" + peakWaiting +
        " settled=" + active.pool.totalCount + "/" + active.pool.idleCount + "/" + active.pool.waitingCount,
    );
    expect(active.pool.waitingCount).toBe(0);
  }, 120_000);

  it("fails a bad endpoint bounded, without falling back to LibSQL", async () => {
    // A closed local port is refused fast; this records the certified adapter's real
    // bound rather than claiming a guarantee the public config does not expose.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@127.0.0.1:1/db");
    const started = Date.now();
    const store = createMastraStorage("san1303-bad-endpoint") as unknown as PooledStore;
    await expect(store.pool.query("select 1")).rejects.toBeTruthy();
    const elapsed = Date.now() - started;
    console.info("[san1303] bad endpoint failed in " + elapsed + "ms");
    expect(elapsed).toBeLessThan(30_000);
    await closeMastraStorageForTests();
  }, 60_000);
});
