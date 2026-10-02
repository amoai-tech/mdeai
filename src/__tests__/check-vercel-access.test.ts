/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * SAN-1330 — the Vercel access check exists because "secret added" is not
 * "secret works": there is a lookalike project also named `mdeai` in another
 * account, and resolving by name returns it without error.
 *
 * These tests pin the identity it asserts and the way the workflow handles the
 * credential. Sources are loaded through Vite's glob so no filesystem path is
 * constructed.
 */
const SCRIPT = path.resolve(process.cwd(), "scripts/check-vercel-access.mjs");

// Literal glob patterns: Vite resolves these at build time, so the test needs no
// filesystem access and builds no path.
const SCRIPT_SOURCES = import.meta.glob("/scripts/check-vercel-access.mjs", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const WORKFLOW_SOURCES = import.meta.glob(
  "/.github/workflows/vercel-access-check.yml",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const script = Object.values(SCRIPT_SOURCES)[0];
const workflow = Object.values(WORKFLOW_SOURCES)[0];
if (typeof script !== "string") throw new Error("access-check script not found via glob");
if (typeof workflow !== "string") throw new Error("access-check workflow not found via glob");

function run(env: Record<string, string>) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: "/nonexistent-home", ...env } as NodeJS.ProcessEnv,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("check-vercel-access — credential handling", () => {
  it("fails loudly when VERCEL_TOKEN is absent", () => {
    const { status, out } = run({});
    expect(out).toContain("VERCEL_TOKEN is required");
    expect(status).toBe(1);
  });

  it("does not fall back to a developer's local Vercel CLI credential", () => {
    // A CLI-auth fallback would pass on a laptop and fail in CI for the same
    // code, and would hide a missing GitHub secret.
    expect(script).not.toContain("com.vercel.cli");
    expect(script).not.toContain("auth.json");
  });
});

describe("check-vercel-access — pins the real production identity", () => {
  it("asserts the production team id", () => {
    expect(script).toContain('"team_ZDZyovkHiBVULVkZLSQ7rEUU"');
  });

  it("asserts the production project id", () => {
    expect(script).toContain('"prj_FRWMRzXWMSzyB0NPR9nbyoz15UUz"');
  });

  it("requires the Next.js framework, so the lookalike vite project cannot pass", () => {
    expect(script).toContain('const EXPECTED_FRAMEWORK = "nextjs"');
  });

  it("requires the production domain", () => {
    expect(script).toContain('const EXPECTED_DOMAIN = "www.mdeai.co"');
  });

  it("refuses to certify a deployment whose SHA is not the expected one", () => {
    expect(script).toContain("refusing to certify a stale deployment");
  });
});

describe("check-vercel-access — workflow wiring", () => {
  it("is manual-only", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).not.toMatch(/^\s{2}(push|schedule|pull_request):/m);
  });

  it("passes the token through secrets rather than inlining it", () => {
    expect(workflow).toContain("VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}");
  });

  it("never prints the token", () => {
    expect(workflow).not.toMatch(/echo\s+"?\$\{?VERCEL_TOKEN/);
    expect(workflow).not.toMatch(/set -x/);
  });
});
