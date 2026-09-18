import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * SAN-1321 — deterministic tests for the Mastra schema-drift gate.
 *
 * The script is the only thing standing between a mis-paired `@mastra/pg` and a
 * fresh environment that silently provisions an incomplete `mastra_*` schema, so
 * its drift detection is pinned here rather than trusted.
 */
const SCRIPT = path.resolve(process.cwd(), "scripts/check-mastra-schema-contract.mjs");
const tmpDirs: string[] = [];

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "" } as NodeJS.ProcessEnv,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function fixtureContract(overrides: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mastra-contract-"));
  tmpDirs.push(dir);
  const file = path.join(dir, "contract.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      adapter: "@mastra/pg",
      adapterVersion: "1.11.0",
      core: "@mastra/core",
      coreVersion: "1.35.0",
      expectedTables: ["mastra_threads", "mastra_messages"],
      ...overrides,
    }),
  );
  return file;
}

describe("check-mastra-schema-contract — matching contract", () => {
  it("passes when the installed packages match the contract", () => {
    const { status, out } = run([
      "--contract",
      fixtureContract({}),
      "--installed-pg",
      "1.11.0",
      "--installed-core",
      "1.35.0",
    ]);
    expect(out).toContain("mastra-schema-contract: OK");
    expect(status).toBe(0);
  });
});

describe("check-mastra-schema-contract — drift detection", () => {
  it("reports a mis-paired adapter without blocking by default", () => {
    // The real 2026-09-18 condition: adapter far behind the installed core.
    const { status, out } = run([
      "--contract",
      fixtureContract({}),
      "--installed-pg",
      "1.1.0-alpha.2",
      "--installed-core",
      "1.35.0",
    ]);
    expect(out).toContain("DRIFT detected");
    expect(out).toContain("@mastra/pg installed=1.1.0-alpha.2 contract=1.11.0");
    expect(out).toContain("WARN (SAN-1321 open");
    expect(status).toBe(0);
  });

  it("fails the same condition under --strict", () => {
    const { status, out } = run([
      "--contract",
      fixtureContract({}),
      "--installed-pg",
      "1.1.0-alpha.2",
      "--installed-core",
      "1.35.0",
      "--strict",
    ]);
    expect(out).toContain("FAIL");
    expect(status).toBe(1);
  });

  it("detects a core version drift even when the adapter matches", () => {
    const { status, out } = run([
      "--contract",
      fixtureContract({}),
      "--installed-pg",
      "1.11.0",
      "--installed-core",
      "1.67.0",
      "--strict",
    ]);
    expect(out).toContain("@mastra/core installed=1.67.0 contract=1.35.0");
    expect(status).toBe(1);
  });

  it("reports a package that is not installed", () => {
    const { status, out } = run([
      "--contract",
      fixtureContract({}),
      "--installed-pg",
      "",
      "--installed-core",
      "1.35.0",
      "--strict",
    ]);
    expect(out).toContain("@mastra/pg is not installed");
    expect(status).toBe(1);
  });
});

describe("check-mastra-schema-contract — contract hygiene", () => {
  it("flags duplicate table names in the contract", () => {
    const { status, out } = run([
      "--contract",
      fixtureContract({ expectedTables: ["mastra_threads", "mastra_threads"] }),
      "--installed-pg",
      "1.11.0",
      "--installed-core",
      "1.35.0",
      "--strict",
    ]);
    expect(out).toContain("duplicate table names");
    expect(status).toBe(1);
  });

  it("flags an empty expected-table contract", () => {
    const { status, out } = run([
      "--contract",
      fixtureContract({ expectedTables: [] }),
      "--installed-pg",
      "1.11.0",
      "--installed-core",
      "1.35.0",
      "--strict",
    ]);
    expect(out).toContain("contract lists no expected tables");
    expect(status).toBe(1);
  });

  it("fails clearly when the contract file is missing", () => {
    const { status, out } = run(["--contract", "/nonexistent/contract.json"]);
    expect(out).toContain("cannot read");
    expect(status).toBe(1);
  });
});

describe("check-mastra-schema-contract — committed contract", () => {
  it("records the production schema shape and the reproducing adapter pairing", () => {
    const contract = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "scripts/mastra-schema-contract.json"), "utf8"),
    );
    // 32 production tables were observed live on 2026-09-18.
    expect(contract.expectedTables).toHaveLength(32);
    expect(contract.expectedTables).toContain("mastra_workspaces");
    expect(contract.expectedTables).toContain("mastra_threads");
    expect(new Set(contract.expectedTables).size).toBe(contract.expectedTables.length);
    // The pairing that reproduces it (same-day release as @mastra/core@1.35.0).
    expect(contract.adapterVersion).toBe("1.11.0");
    expect(contract.coreVersion).toBe("1.35.0");
  });
});
