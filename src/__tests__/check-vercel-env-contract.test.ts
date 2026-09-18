import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * SAN-1330 — tests for the Vercel public-variable contract preflight.
 *
 * The script diagnoses the SAN-1322 root cause from environment *metadata*
 * (`NEXT_PUBLIC_*` stored as a Secret cannot reach the client build) before a
 * production deployment is attempted. These tests drive the real script offline
 * via `--input`, so they are deterministic and never touch the network or print
 * a value.
 */
const SCRIPT = path.resolve(process.cwd(), "scripts/check-vercel-env-contract.mjs");
const tmpDirs: string[] = [];

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

type EnvEntry = { key: string; type: string; target: string[] };

function withInput(envs: EnvEntry[], args: string[] = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-env-"));
  tmpDirs.push(dir);
  const file = path.join(dir, "env.json");
  fs.writeFileSync(file, JSON.stringify(envs));
  const result = spawnSync(process.execPath, [SCRIPT, "--input", file, ...args], {
    encoding: "utf8",
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
