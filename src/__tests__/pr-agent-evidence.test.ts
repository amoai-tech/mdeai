import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = "scripts/pr-agent/build-evidence.mjs";
const lock = (versions: Record<string, string>) => ({
  lockfileVersion: 3,
  packages: Object.fromEntries(
    Object.entries(versions).map(([name, version]) => [
      `node_modules/${name}`,
      { version },
    ]),
  ),
});

async function loadBuilder() {
  return import("../../scripts/pr-agent/build-evidence.mjs");
}

describe("SAN-1332 PR-Agent evidence builder", () => {
  it("ships a trusted evidence builder", () => {
    expect(existsSync(script)).toBe(true);
  });
  it("resolves exact package versions from lockfiles", async () => {
    const { resolvePackageVersion } = await loadBuilder();
    const sample = lock({
      "next": "16.3.5",
      "@copilotkit/runtime": "1.55.2",
      "@supabase/supabase-js": "2.106.1",
      "@mastra/core": "1.35.0",
    });

    expect(resolvePackageVersion(sample, "next")).toBe("16.3.5");
    expect(resolvePackageVersion(sample, "@mastra/core")).toBe("1.35.0");
    expect(resolvePackageVersion(sample, "missing-package")).toBeNull();
  });

  it("detects touched framework domains including proxy auth", async () => {
    const { detectDomains } = await loadBuilder();
    expect(detectDomains([
      "src/proxy.ts",
      "src/mastra/agents/concierge.ts",
      "src/components/copilotkit/chat.tsx",
    ])).toEqual(["nextjs", "supabase", "mastra", "copilotkit"]);
  });
  it("records base/head provenance and version changes", async () => {
    const { buildEvidence } = await loadBuilder();
    const result = buildEvidence({
      baseSha: "base123",
      headSha: "head456",
      changedFiles: ["src/proxy.ts"],
      baseLock: lock({ "next": "16.3.4", "@supabase/supabase-js": "2.105.0" }),
      headLock: lock({ "next": "16.3.5", "@supabase/supabase-js": "2.106.1" }),
    });

    expect(result.status).toBe("VERIFIED");
    expect(result.markdown).toContain("Base SHA: `base123`");
    expect(result.markdown).toContain("Head SHA: `head456`");
    expect(result.markdown).toContain("`next`: 16.3.4 → 16.3.5");
    expect(result.markdown).toContain("`@supabase/supabase-js`: 2.105.0 → 2.106.1");
  });

  it("grounds the PR #76 proxy/getClaims regression in exact versions", async () => {
    const { buildEvidence } = await loadBuilder();
    const versions = lock({
      "next": "16.3.5",
      "@supabase/supabase-js": "2.106.1",
      "@supabase/ssr": "0.10.3",
    });
    const result = buildEvidence({
      baseSha: "base123",
      headSha: "head456",
      changedFiles: ["src/proxy.ts", "src/lib/supabase/middleware.ts"],
      baseLock: versions,
      headLock: versions,
    });

    expect(result.status).toBe("VERIFIED");
    expect(result.domains).toEqual(["nextjs", "supabase"]);
    expect(result.markdown).toContain("`next`: 16.3.5 → 16.3.5");
    expect(result.markdown).toContain("`@supabase/supabase-js`: 2.106.1 → 2.106.1");
  });

  it("fails closed when required evidence cannot be resolved", async () => {
    const { buildEvidence } = await loadBuilder();
    const result = buildEvidence({
      baseSha: "base123",
      headSha: "head456",
      changedFiles: ["src/mastra/agents/concierge.ts"],
      baseLock: lock({}),
      headLock: lock({}),
    });

    expect(result.status).toBe("NEEDS VERIFICATION");
    expect(result.markdown).toContain("Missing exact version evidence");
  });
});
