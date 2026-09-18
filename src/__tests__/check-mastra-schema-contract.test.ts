/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

/**
 * SAN-1321 — deterministic tests for the Mastra schema-drift gate.
 *
 * The script is the only thing standing between a mis-paired `@mastra/pg` and a
 * fresh environment that silently provisions an incomplete `mastra_*` schema, so
 * its drift detection is pinned here rather than trusted.
 *
 * Fixtures are piped on stdin (`--contract -`) and the committed contract is read
 * through Vite's glob, so these tests touch no filesystem and build no path.
 */
const SCRIPT = "scripts/check-mastra-schema-contract.mjs";

/**
 * Immutable baseline: the production `public.mastra_*` schema observed live on
 * 2026-09-18. A contract edit that drops or renames any of these fails here.
 */
const PRODUCTION_MASTRA_TABLES = [
  "mastra_agent_versions",
  "mastra_agents",
  "mastra_ai_spans",
  "mastra_background_tasks",
  "mastra_channel_config",
  "mastra_channel_installations",
  "mastra_dataset_items",
  "mastra_dataset_versions",
  "mastra_datasets",
  "mastra_experiment_results",
  "mastra_experiments",
  "mastra_mcp_client_versions",
  "mastra_mcp_clients",
  "mastra_mcp_server_versions",
  "mastra_mcp_servers",
  "mastra_messages",
  "mastra_observational_memory",
  "mastra_prompt_block_versions",
  "mastra_prompt_blocks",
  "mastra_resources",
  "mastra_schedule_triggers",
  "mastra_schedules",
  "mastra_scorer_definition_versions",
  "mastra_scorer_definitions",
  "mastra_scorers",
  "mastra_skill_blobs",
  "mastra_skill_versions",
  "mastra_skills",
  "mastra_threads",
  "mastra_workflow_snapshot",
  "mastra_workspace_versions",
  "mastra_workspaces",
];

const CONTRACT_SOURCES = import.meta.glob("/scripts/mastra-schema-contract.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const committedContract = JSON.parse(Object.values(CONTRACT_SOURCES)[0]) as {
  expectedTables: string[];
  adapterVersion: string;
  coreVersion: string;
};

function run(args: string[], contract?: Record<string, unknown>) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    input: contract ? JSON.stringify(contract) : undefined,
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "" } as NodeJS.ProcessEnv,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    adapter: "@mastra/pg",
    adapterVersion: "1.11.0",
    core: "@mastra/core",
    coreVersion: "1.35.0",
    expectedTables: ["mastra_threads", "mastra_messages"],
    ...overrides,
  };
}

/** Run against a piped contract fixture. */
function runFixture(overrides: Record<string, unknown>, args: string[] = []) {
  return run(["--contract", "-", ...args], fixture(overrides));
}

const MATCHING = ["--installed-pg", "1.11.0", "--installed-core", "1.35.0"];

describe("check-mastra-schema-contract — matching contract", () => {
  it("passes when the installed packages match the contract", () => {
    const { status, out } = runFixture({}, MATCHING);
    expect(out).toContain("mastra-schema-contract: OK");
    expect(status).toBe(0);
  });
});

describe("check-mastra-schema-contract — drift detection", () => {
  it("reports a mis-paired adapter without blocking by default", () => {
    // The real 2026-09-18 condition: adapter far behind the installed core.
    const { status, out } = runFixture({}, [
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
    const { status, out } = runFixture(
      {},
      ["--installed-pg", "1.1.0-alpha.2", "--installed-core", "1.35.0", "--strict"],
    );
    expect(out).toContain("FAIL");
    expect(status).toBe(1);
  });

  it("detects a core version drift even when the adapter matches", () => {
    const { status, out } = runFixture(
      {},
      ["--installed-pg", "1.11.0", "--installed-core", "1.67.0", "--strict"],
    );
    expect(out).toContain("@mastra/core installed=1.67.0 contract=1.35.0");
    expect(status).toBe(1);
  });

  it("reports a package that is not installed", () => {
    const { status, out } = runFixture(
      {},
      ["--installed-pg", "", "--installed-core", "1.35.0", "--strict"],
    );
    expect(out).toContain("@mastra/pg is not installed");
    expect(status).toBe(1);
  });
});

describe("check-mastra-schema-contract — contract hygiene", () => {
  it("flags duplicate table names in the contract", () => {
    const { status, out } = runFixture(
      { expectedTables: ["mastra_threads", "mastra_threads"] },
      [...MATCHING, "--strict"],
    );
    expect(out).toContain("duplicate table names");
    expect(status).toBe(1);
  });

  it("flags an empty expected-table contract", () => {
    const { status, out } = runFixture({ expectedTables: [] }, [...MATCHING, "--strict"]);
    expect(out).toContain("contract lists no expected tables");
    expect(status).toBe(1);
  });

  it("rejects table names outside the mastra_ namespace", () => {
    // Padding the contract with plausible names from another schema must fail:
    // unique, non-empty names are not enough.
    const { status, out } = runFixture(
      { expectedTables: ["mastra_threads", "public_users", "public_orders"] },
      [...MATCHING, "--strict"],
    );
    expect(out).toContain("outside the mastra_ namespace");
    expect(out).toContain("public_users");
    expect(status).toBe(1);
  });

  it("rejects a non-string table name", () => {
    const { status, out } = runFixture(
      { expectedTables: ["mastra_threads", 42] },
      [...MATCHING, "--strict"],
    );
    expect(out).toContain("outside the mastra_ namespace");
    expect(status).toBe(1);
  });

  it("fails clearly when the contract file is missing", () => {
    // Both modes must fail: an unreadable contract is never a silent pass.
    const plain = run(["--contract", "/nonexistent/contract.json"]);
    expect(plain.out).toContain("cannot read");
    expect(plain.status).toBe(1);

    const strictRun = run(["--contract", "/nonexistent/contract.json", "--strict"]);
    expect(strictRun.status).toBe(1);
  });

  it("fails when stdin carries unparseable JSON", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--contract", "-"], {
      encoding: "utf8",
      input: "{ not json",
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "" } as NodeJS.ProcessEnv,
    });
    expect(`${result.stdout}${result.stderr}`).toContain("cannot read stdin");
    expect(result.status).toBe(1);
  });

  it("does not read a manifest outside node_modules for a crafted adapter name", () => {
    // `installedVersion` resolves the name from the contract; a traversal attempt
    // must be treated as "not installed" rather than reading an arbitrary file.
    const { status, out } = runFixture(
      { adapter: "../../../package", adapterVersion: "9.9.9" },
      ["--installed-core", "1.35.0", "--strict"],
    );
    expect(out).toContain("../../../package is not installed");
    expect(status).toBe(1);
  });
});

describe("check-mastra-schema-contract — committed contract", () => {
  it("records exactly the production schema and the reproducing adapter pairing", () => {
    // Full-set equality, not a length + spot-check: dropping or renaming any
    // required production table must fail here.
    expect([...committedContract.expectedTables].sort()).toEqual(
      [...PRODUCTION_MASTRA_TABLES].sort(),
    );
    expect(committedContract.expectedTables).toHaveLength(32);
    expect(new Set(committedContract.expectedTables).size).toBe(32);
    // The pairing that reproduces it (same-day release as @mastra/core@1.35.0).
    expect(committedContract.adapterVersion).toBe("1.11.0");
    expect(committedContract.coreVersion).toBe("1.35.0");
  });

  it("keeps every baseline table inside the mastra_ namespace", () => {
    for (const table of PRODUCTION_MASTRA_TABLES) {
      expect(table).toMatch(/^mastra_[a-z0-9_]+$/);
    }
  });
});
