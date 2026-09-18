import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * SAN-1314 — deterministic tests for the environment-contract gate.
 *
 * `scripts/check-env-contract.mjs` runs at the start of `npm run build` and is
 * the check that stops a "Vercel READY but the client bundle is broken"
 * deployment. These tests drive the real script in a subprocess with a scrubbed
 * environment so the gate's behaviour cannot silently drift, and they never
 * print or assert on variable values.
 */
const SCRIPT = path.resolve(process.cwd(), "scripts/check-env-contract.mjs");

const CI_CLIENT = {
  NEXT_PUBLIC_SUPABASE_URL: "https://unit-test.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit_test",
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "unit-test-maps-key",
};

function run(args: string[], env: Record<string, string>) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    // Scrubbed environment: only what the test provides (NODE_ENV is required by
    // the repo's augmented ProcessEnv type and is irrelevant to the script).
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env } as NodeJS.ProcessEnv,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("check-env-contract — build mode", () => {
  it("does not block a non-production build when a client var is missing", () => {
    const { status, out } = run(["--mode=build"], {
      NEXT_PUBLIC_SUPABASE_URL: CI_CLIENT.NEXT_PUBLIC_SUPABASE_URL,
    });
    expect(out).toContain("missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
    expect(out).toContain("env-contract: OK");
    expect(status).toBe(0);
  });

  it("fails a strict build when a required client var is missing", () => {
    const { status, out } = run(["--mode=build", "--strict"], {
      NEXT_PUBLIC_SUPABASE_URL: CI_CLIENT.NEXT_PUBLIC_SUPABASE_URL,
    });
    expect(out).toContain("MISSING NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
    expect(out).toContain("env-contract: FAIL");
    expect(status).toBe(1);
  });

  it("passes a strict build when the CI-provisioned client contract is complete", () => {
    // NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID is production-only and must not block CI.
    const { status, out } = run(["--mode=build", "--strict"], CI_CLIENT);
    expect(out).toContain("n/a     NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID");
    expect(out).toContain("env-contract: OK");
    expect(status).toBe(0);
  });

  it("auto-fails a production build when the Maps key is absent from the build env", () => {
    // This is the exact SAN-1322 condition: the variable existed in the project
    // but never reached the build, so the client bundle was compiled broken.
    const { status, out } = run(["--mode=build"], {
      ...CI_CLIENT,
      VERCEL_ENV: "production",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
    });
    expect(out).toContain("strict=true");
    expect(out).toContain("MISSING NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
    expect(status).toBe(1);
  });

  it("accepts the legacy anon key as an alternative to the publishable key", () => {
    const { status } = run(["--mode=build", "--strict"], {
      NEXT_PUBLIC_SUPABASE_URL: CI_CLIENT.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-unit-test",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: CI_CLIENT.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    });
    expect(status).toBe(0);
  });
});

describe("check-env-contract — runtime mode", () => {
  it("fails when a required runtime secret is missing", () => {
    const { status, out } = run(["--mode=runtime"], {
      NEXT_PUBLIC_SUPABASE_URL: CI_CLIENT.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CI_CLIENT.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(out).toContain("MISSING DATABASE_URL");
    expect(out).toContain("MISSING SUPABASE_SERVICE_ROLE_KEY");
    expect(status).toBe(1);
  });

  it("passes when the runtime contract is complete", () => {
    const { status, out } = run(["--mode=runtime"], {
      DATABASE_URL: "postgresql://unit-test-host/unit-test-db",
      SUPABASE_SERVICE_ROLE_KEY: "unit-test-service-role",
      NEXT_PUBLIC_SUPABASE_URL: CI_CLIENT.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CI_CLIENT.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(out).toContain("env-contract: OK");
    expect(status).toBe(0);
  });

  it("reports the build-time tier as not enforced in runtime mode", () => {
    const { out } = run(["--mode=runtime"], {});
    expect(out).toContain("not enforced in this mode (build-time client tier)");
  });
});

describe("check-env-contract — output safety", () => {
  it("never prints a variable value", () => {
    const secret = "supersecret-value-that-must-not-be-printed";
    const { out } = run(["--mode=runtime", "--strict"], {
      DATABASE_URL: `postgresql://user:${secret}@host/db`,
      SUPABASE_SERVICE_ROLE_KEY: secret,
      NEXT_PUBLIC_SUPABASE_URL: CI_CLIENT.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CI_CLIENT.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(out).not.toContain(secret);
  });
});
