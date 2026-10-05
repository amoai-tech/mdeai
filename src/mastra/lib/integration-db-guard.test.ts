import { afterEach, describe, expect, it } from "vitest";
import {
  assertLoopbackDatabaseUrl,
  REMOTE_DB_HOST_PIN,
} from "./integration-db-guard";

const FLAG = "MASTRA_TEST_INTEGRATION";
const originalPin = process.env[REMOTE_DB_HOST_PIN];

describe("assertLoopbackDatabaseUrl", () => {
  afterEach(() => {
    if (originalPin === undefined) delete process.env[REMOTE_DB_HOST_PIN];
    else process.env[REMOTE_DB_HOST_PIN] = originalPin;
  });

  it.each([
    ["localhost", "postgresql://postgres:pw@localhost:5432/postgres"],
    ["127.0.0.1", "postgresql://postgres:pw@127.0.0.1:5432/postgres"],
    ["IPv6 ::1", "postgresql://postgres:pw@[::1]:5432/postgres"],
  ])("allows a loopback host (%s)", (_label, url) => {
    delete process.env[REMOTE_DB_HOST_PIN];
    expect(() => assertLoopbackDatabaseUrl(url, FLAG)).not.toThrow();
  });

  it("refuses the IPv6 unspecified address :: (not loopback)", () => {
    delete process.env[REMOTE_DB_HOST_PIN];
    expect(() =>
      assertLoopbackDatabaseUrl("postgresql://postgres:pw@[::]:5432/postgres", FLAG),
    ).toThrow(/non-loopback/);
  });

  it("refuses the Supabase pooler used in this audit", () => {
    delete process.env[REMOTE_DB_HOST_PIN];
    expect(() =>
      assertLoopbackDatabaseUrl(
        "postgresql://postgres.zkwcbyxiwklihegjhuql:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
        FLAG,
      ),
    ).toThrow(/non-loopback/);
  });

  it("refuses the direct Supabase host", () => {
    delete process.env[REMOTE_DB_HOST_PIN];
    expect(() =>
      assertLoopbackDatabaseUrl(
        "postgresql://postgres:pw@db.zkwcbyxiwklihegjhuql.supabase.co:5432/postgres",
        FLAG,
      ),
    ).toThrow(/non-loopback/);
  });

  it("does not mistake a lookalike hostname for loopback", () => {
    delete process.env[REMOTE_DB_HOST_PIN];
    expect(() =>
      assertLoopbackDatabaseUrl("postgresql://u:p@localhost.evil.example:5432/db", FLAG),
    ).toThrow(/non-loopback/);
  });

  it("refuses a missing DATABASE_URL", () => {
    expect(() => assertLoopbackDatabaseUrl(undefined, FLAG)).toThrow(/DATABASE_URL is missing/);
    expect(() => assertLoopbackDatabaseUrl("   ", FLAG)).toThrow(/DATABASE_URL is missing/);
  });

  it("refuses an unparseable connection string", () => {
    expect(() => assertLoopbackDatabaseUrl("not a url", FLAG)).toThrow(/not a parseable/);
  });

  it("refuses a remote host even when a pin is set, unless the caller opts in", () => {
    process.env[REMOTE_DB_HOST_PIN] = "remote-test-db.example";
    expect(() =>
      assertLoopbackDatabaseUrl("postgresql://u:p@remote-test-db.example:5432/db", FLAG),
    ).toThrow(/non-loopback/);
  });

  it("allows the exact pinned remote host when the caller opts in", () => {
    process.env[REMOTE_DB_HOST_PIN] = "remote-test-db.example";
    expect(() =>
      assertLoopbackDatabaseUrl("postgresql://u:p@remote-test-db.example:5432/db", FLAG, {
        allowRemoteHostEnv: REMOTE_DB_HOST_PIN,
      }),
    ).not.toThrow();
  });

  it("refuses a remote host that does not match the pin", () => {
    process.env[REMOTE_DB_HOST_PIN] = "expected-test-db.example";
    expect(() =>
      assertLoopbackDatabaseUrl("postgresql://u:p@someone-elses-db.example:5432/db", FLAG, {
        allowRemoteHostEnv: REMOTE_DB_HOST_PIN,
      }),
    ).toThrow(/does not match the pinned/);
  });

  it("refuses a remote host when the caller opts in but the pin is unset", () => {
    delete process.env[REMOTE_DB_HOST_PIN];
    expect(() =>
      assertLoopbackDatabaseUrl("postgresql://u:p@anywhere.example:5432/db", FLAG, {
        allowRemoteHostEnv: REMOTE_DB_HOST_PIN,
      }),
    ).toThrow(/non-loopback/);
  });
});
