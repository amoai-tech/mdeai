import { afterEach, describe, expect, it } from "vitest";
import {
  assertLoopbackDatabaseUrl,
  REMOTE_INTEGRATION_OPT_IN,
} from "./integration-db-guard";

const FLAG = "MASTRA_TEST_INTEGRATION";
const originalOptIn = process.env[REMOTE_INTEGRATION_OPT_IN];

describe("assertLoopbackDatabaseUrl", () => {
  afterEach(() => {
    if (originalOptIn === undefined) delete process.env[REMOTE_INTEGRATION_OPT_IN];
    else process.env[REMOTE_INTEGRATION_OPT_IN] = originalOptIn;
  });

  it.each([
    ["localhost", "postgresql://postgres:pw@localhost:5432/postgres"],
    ["127.0.0.1", "postgresql://postgres:pw@127.0.0.1:5432/postgres"],
    ["IPv6 ::1", "postgresql://postgres:pw@[::1]:5432/postgres"],
  ])("allows a loopback host (%s)", (_label, url) => {
    delete process.env[REMOTE_INTEGRATION_OPT_IN];
    expect(() => assertLoopbackDatabaseUrl(url, FLAG)).not.toThrow();
  });

  it("refuses the Supabase pooler used in this audit", () => {
    delete process.env[REMOTE_INTEGRATION_OPT_IN];
    expect(() =>
      assertLoopbackDatabaseUrl(
        "postgresql://postgres.zkwcbyxiwklihegjhuql:pw@aws-1-us-east-1.pooler.supabase.com:6543/postgres",
        FLAG,
      ),
    ).toThrow(/non-loopback/);
  });

  it("refuses the direct Supabase host", () => {
    delete process.env[REMOTE_INTEGRATION_OPT_IN];
    expect(() =>
      assertLoopbackDatabaseUrl(
        "postgresql://postgres:pw@db.zkwcbyxiwklihegjhuql.supabase.co:5432/postgres",
        FLAG,
      ),
    ).toThrow(/non-loopback/);
  });

  it("does not mistake a lookalike hostname for loopback", () => {
    delete process.env[REMOTE_INTEGRATION_OPT_IN];
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

  it("allows a remote host only with the explicit opt-in", () => {
    process.env[REMOTE_INTEGRATION_OPT_IN] = "1";
    expect(() =>
      assertLoopbackDatabaseUrl(
        "postgresql://postgres:pw@remote-test-db.example:5432/postgres",
        FLAG,
      ),
    ).not.toThrow();
  });
});
