import { describe, it, expect } from "vitest";
import { PostgresStore } from "@mastra/pg";

/**
 * SAN-1321 — the installed `@mastra/pg` must expose every storage domain this
 * application's schema depends on.
 *
 * The version-contract check (`check-mastra-schema-contract.mjs`) catches a
 * mis-paired adapter by *version*. This catches it by *capability*, which is the
 * part that actually breaks a feature.
 *
 * On 2026-09-18 the pinned `@mastra/pg@1.1.0-alpha.2` exposed only five domains
 * (workflows, memory, scores, agents, observability) while `@mastra/core@1.35.0`
 * declared eighteen. Workspaces, schedules, skills, MCP, datasets and prompt
 * blocks were unreachable, and a fresh environment provisioned 8 of production's
 * 32 `mastra_*` tables. The app registers a Mastra `Workspace` and references
 * schedules, so those features simply cannot work on a fresh install with the
 * old pin.
 *
 * `favorites` and `blobs` are deliberately NOT required: the new adapter adds
 * them, but they are outside the committed 32-table schema contract, so
 * requiring them would over-constrain the pin.
 *
 * Domain discovery is lazy — no database is contacted — so this is a
 * deterministic unit test.
 */
const REQUIRED_DOMAINS = [
  // core session/workflow storage
  "workflows",
  "memory",
  "agents",
  "observability",
  "scores",
  // domains production's schema carries and the pinned alpha could not reach
  "schedules",
  "workspaces",
  "datasets",
  "experiments",
  "skills",
  "mcpServers",
  "mcpClients",
  "channels",
  "promptBlocks",
  "scorerDefinitions",
  "backgroundTasks",
] as const;

describe("mastra storage domains", () => {
  it("exposes every storage domain the schema contract depends on", async () => {
    // Unreachable on purpose: getStore() must not need a live connection.
    const store = new PostgresStore({
      id: "domain-probe",
      connectionString: "postgresql://unused:unused@127.0.0.1:1/unused",
      disableInit: true,
    });

    const missing: string[] = [];
    for (const domain of REQUIRED_DOMAINS) {
      const domainStore = await Promise.resolve(store.getStore(domain)).catch(() => null);
      if (!domainStore) missing.push(domain);
    }
    await Promise.resolve(store.close()).catch(() => {});

    expect(
      missing,
      `@mastra/pg does not expose these storage domains: ${missing.join(", ")}. ` +
        "It is mis-paired with @mastra/core — align the adapter (see " +
        "scripts/mastra-schema-contract.json) before shipping.",
    ).toEqual([]);
  });

  it("can list schedules, a domain the previous pin could not reach at all", async () => {
    const store = new PostgresStore({
      id: "domain-probe-schedules",
      connectionString: "postgresql://unused:unused@127.0.0.1:1/unused",
      disableInit: true,
    });
    const schedules = await Promise.resolve(store.getStore("schedules")).catch(() => null);
    await Promise.resolve(store.close()).catch(() => {});
    expect(schedules, "schedules domain store is missing").toBeTruthy();
    expect(typeof (schedules as { listSchedules?: unknown }).listSchedules).toBe("function");
  });
});
