import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * SAN-1330 — tests for the Vercel public-variable contract preflight.
 *
 * The script diagnoses the SAN-1322 root cause from environment *metadata*
 * (`NEXT_PUBLIC_*` stored as a Secret cannot reach the client build) before a
 * production deployment is attempted. These tests drive the real script offline
 * by piping metadata on stdin, so they are deterministic, touch no filesystem and
 * never print a value.
 */
const SCRIPT = path.resolve(process.cwd(), "scripts/check-vercel-env-contract.mjs");

type EnvEntry = { key: string; type: string; target: string[] };

function withInput(envs: EnvEntry[], args: string[] = []) {
  const result = spawnSync(process.execPath, [SCRIPT, "--input", "-", ...args], {
    encoding: "utf8",
    input: JSON.stringify(envs),
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "" } as NodeJS.ProcessEnv,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

const GOOD: EnvEntry[] = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", type: "encrypted", target: ["production", "preview"] },
  { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", type: "encrypted", target: ["production", "preview"] },
  { key: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", type: "encrypted", target: ["production", "preview"] },
  { key: "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", type: "encrypted", target: ["production", "preview"] },
];

describe("vercel-env-contract — healthy project", () => {
  it("passes when every public variable is Config for production", () => {
    const { status, out } = withInput(GOOD);
    expect(out).toContain("vercel-env-contract: OK");
    expect(status).toBe(0);
  });

  it("accepts the legacy anon key in place of the publishable key", () => {
    const { status, out } = withInput([
      GOOD[0],
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", type: "encrypted", target: ["production"] },
      GOOD[2],
      GOOD[3],
    ]);
    expect(out).toContain("ok      NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(out).toContain("vercel-env-contract: OK");
    expect(status).toBe(0);
  });

  it("applies the same Config requirement to a legacy anon key stored as a Secret", () => {
    // The anon key is also a NEXT_PUBLIC_* value compiled into the bundle, so
    // storing it as a Secret is the same defect as the Maps key.
    const { status, out } = withInput([
      GOOD[0],
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", type: "sensitive", target: ["production"] },
      GOOD[2],
      GOOD[3],
    ]);
    expect(out).toContain("SECRET  NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(status).toBe(1);
  });
});

describe("vercel-env-contract — the SAN-1322 condition", () => {
  it("fails when a public variable is stored as a Secret", () => {
    const { status, out } = withInput([
      GOOD[0],
      GOOD[1],
      { key: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", type: "sensitive", target: ["production", "preview"] },
      { key: "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", type: "sensitive", target: ["production", "preview"] },
    ]);
    expect(out).toContain("SECRET  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (type=sensitive)");
    expect(out).toContain("FAIL — 2 problem(s)");
    expect(status).toBe(1);
  });

  it("reports a public variable missing for production", () => {
    const { status, out } = withInput([GOOD[0], GOOD[1], GOOD[2]]);
    expect(out).toContain("MISSING NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID");
    expect(status).toBe(1);
  });

  it("treats a preview-only variable as missing for production", () => {
    const { status, out } = withInput([
      GOOD[0],
      GOOD[1],
      GOOD[2],
      { key: "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", type: "encrypted", target: ["preview"] },
    ]);
    expect(out).toContain("MISSING NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID");
    expect(status).toBe(1);
  });

  it("stays advisory under --warn-only", () => {
    const { status, out } = withInput(
      [GOOD[0], GOOD[1], { key: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", type: "secret", target: ["production"] }, GOOD[3]],
      ["--warn-only"],
    );
    expect(out).toContain("WARN (advisory mode)");
    expect(status).toBe(0);
  });
});

describe("vercel-env-contract — every NEXT_PUBLIC_* must be Config", () => {
  it("advises, but does not fail, on a NEXT_PUBLIC_* outside the contract stored as Sensitive", () => {
    // Metadata cannot tell whether a name is read by the client, read only on the
    // server, or unused — so it must not block a release. In this repo
    // NEXT_PUBLIC_SITE_URL is server-only and NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY
    // is unused.
    const { status, out } = withInput([
      ...GOOD,
      { key: "NEXT_PUBLIC_SITE_URL", type: "sensitive", target: ["production", "preview"] },
    ]);
    expect(out).toContain("advisory");
    expect(out).toContain("REVIEW  NEXT_PUBLIC_SITE_URL (type=sensitive)");
    expect(out).toContain("vercel-env-contract: OK");
    expect(status).toBe(0);
  });

  it("passes the real production shape: contract satisfied with two advisories", () => {
    const { status, out } = withInput([
      ...GOOD,
      { key: "NEXT_PUBLIC_SITE_URL", type: "sensitive", target: ["production", "preview"] },
      {
        key: "NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY",
        type: "sensitive",
        target: ["production", "preview"],
      },
    ]);
    expect(out).toContain("REVIEW  NEXT_PUBLIC_SITE_URL");
    expect(out).toContain("REVIEW  NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY");
    expect(out).toContain("vercel-env-contract: OK");
    expect(status).toBe(0);
  });

  it("accepts an extra NEXT_PUBLIC_* stored as Config", () => {
    const { status, out } = withInput([
      ...GOOD,
      { key: "NEXT_PUBLIC_SITE_URL", type: "encrypted", target: ["production"] },
    ]);
    expect(out).toContain("vercel-env-contract: OK");
    expect(status).toBe(0);
  });

  it("ignores a preview-only NEXT_PUBLIC_* secret", () => {
    const { status, out } = withInput([
      ...GOOD,
      { key: "NEXT_PUBLIC_SITE_URL", type: "sensitive", target: ["preview"] },
    ]);
    expect(out).toContain("vercel-env-contract: OK");
    expect(status).toBe(0);
  });

  it("prefers a Config fallback over a Secret primary", () => {
    // The runtime resolves by name: a Secret publishable key is `undefined` in
    // the bundle, so a Config legacy anon key still works. Flagging the primary
    // alone would block a deployment that functions correctly.
    const { status, out } = withInput([
      GOOD[0],
      { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", type: "sensitive", target: ["production"] },
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", type: "encrypted", target: ["production"] },
      GOOD[2],
      GOOD[3],
    ]);
    expect(out).toContain("ok      NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(out).toContain("vercel-env-contract: OK");
    expect(status).toBe(0);
  });

  it("still fails when every candidate for a required name is a Secret", () => {
    const { status, out } = withInput([
      GOOD[0],
      { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", type: "sensitive", target: ["production"] },
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", type: "sensitive", target: ["production"] },
      GOOD[2],
      GOOD[3],
    ]);
    expect(out).toContain("SECRET");
    expect(status).toBe(1);
  });

  it("does not report a required fallback name whose primary is satisfied", () => {
    // The publishable key meets the contract, so the legacy alias must not be
    // counted as a second failure.
    const { status, out } = withInput([
      ...GOOD,
      { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", type: "sensitive", target: ["production"] },
    ]);
    expect(out).toContain("vercel-env-contract: OK");
    expect(status).toBe(0);
  });
});

describe("vercel-env-contract — report safety", () => {
  it("prints names and types but never a value", () => {
    const secretValue = "supersecret-value-must-not-appear";
    const { out } = withInput(
      GOOD.map((e) => ({ ...e, value: secretValue })) as EnvEntry[],
    );
    expect(out).not.toContain(secretValue);
  });

  it("fails clearly when credentials are unavailable and no input is given", () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: "/nonexistent-home" } as NodeJS.ProcessEnv,
    });
    const out = `${result.stdout}${result.stderr}`;
    expect(out).toContain("no Vercel credentials");
    expect(result.status).toBe(1);
  });
});
