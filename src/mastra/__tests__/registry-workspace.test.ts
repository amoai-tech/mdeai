import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Mastra registration in hosted runtimes", () => {
  it("registers all product agents without local workspace on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.resetModules();

    const { mastra } = await import("../index");
    expect(mastra.getWorkspace()).toBeUndefined();
    expect(Object.keys(mastra.listAgents())).toEqual(
      expect.arrayContaining([
        "pingAgent",
        "routerAgent",
        "rentalAgent",
        "conciergeAgent",
        "eventAgent",
        "evaluationAgent",
        "hostEventAgent",
        "hostOpsAgent",
        "partnerAgent",
      ]),
    );
    expect(Object.keys(mastra.listAgents())).toHaveLength(9);
    const concierge = mastra.getAgentById("concierge-agent");
    expect(concierge).toBeDefined();
    // Removing inherited file tools must preserve the actual discovery actions.
    const tools = Object.keys(await concierge.listTools());
    expect(tools).toEqual(
      expect.arrayContaining([
        "searchRentalsTool",
        "searchEventsTool",
        "searchRestaurantsTool",
      ]),
    );
    expect(tools.some((id) => id.includes("workspace"))).toBe(false);
  }, 15_000); // Real registry import can exceed Vitest's 5s default in parallel floor runs.

  it("does not expose Builder in the Next app with a shared local opt-in", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.stubEnv("MASTRA_DEV", "");
    vi.resetModules();

    const { mastra } = await import("../index");
    expect(Object.keys(mastra.listAgents())).toHaveLength(9);
    expect(mastra.getEditor()).toBeUndefined();
  }, 15_000);

  it("does not initialize Builder during Next production builds", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.resetModules();

    const { mastra } = await import("../index");
    expect(Object.keys(mastra.listAgents())).toHaveLength(9);
    expect(mastra.getEditor()).toBeUndefined();
  }, 15_000);

  it("rejects standalone Studio with both flags enabled on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.resetModules();
    await expect(import("../../mastra-studio")).rejects.toThrow(/prohibited in Next\/Vercel/);
  }, 15_000);

  it("rejects standalone Studio with Builder opt-in missing", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "");
    vi.resetModules();
    await expect(import("../../mastra-studio")).rejects.toThrow(/explicit opt-in/);
  }, 15_000);

  it("rejects missing PWD if cwd is not the actual repository root", async () => {
    const invalidRoot = mkdtempSync(join(tmpdir(), "mde-builder-bad-cwd-"));
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("MASTRA_DEV_LIBSQL", "1");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("PWD", undefined);
    vi.spyOn(process, "cwd").mockReturnValue(invalidRoot);
    vi.resetModules();
    try {
      await expect(import("../../mastra-studio")).rejects.toThrow(/needs PWD pointing to the MDE project root/);
    } finally {
      rmSync(invalidRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects Builder when local-only agent memory storage is not configured", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("MASTRA_DEV_LIBSQL", "");
    vi.stubEnv("NEXT_PHASE", undefined);
    vi.resetModules();
    await expect(import("../../mastra-studio")).rejects.toThrow(/MASTRA_DEV_LIBSQL=1/);
  }, 15_000);

  it("enables standalone local Studio with NEXT_PHASE absent and stores drafts outside .mastra", async () => {
    const root = mkdtempSync(join(tmpdir(), "mde-mastra-builder-"));
    mkdirSync(join(root, "src", "mastra"), { recursive: true });
    writeFileSync(join(root, "src", "mastra", "index.ts"), "// fixture repo marker");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MDE_MASTRA_AGENT_BUILDER", "1");
    vi.stubEnv("MASTRA_DEV", "true");
    vi.stubEnv("NEXT_PHASE", undefined);
    vi.stubEnv("MASTRA_DEV_LIBSQL", "1");
    vi.stubEnv("PWD", root);
    vi.resetModules();

    try {
      const { mastra } = await import("../../mastra-studio");
      expect(Object.keys(mastra.listAgents())).toHaveLength(1);
      expect(mastra.listAgents()).toHaveProperty("builderAgent");
      expect(mastra.listAgents()).not.toHaveProperty("rentalAgent");
      expect(mastra.listAgents()).not.toHaveProperty("conciergeAgent");
      expect(mastra.getEditor()).toBeDefined();
      expect(mastra.getStorage()).toBeDefined();
      // The editor database path is projectRoot/.mde-builder.db, never inside
      // the ephemeral Mastra CLI output directory (.mastra/).
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);
});
