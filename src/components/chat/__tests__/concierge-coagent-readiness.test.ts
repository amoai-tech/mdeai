import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Concierge CopilotKit readiness compatibility guard", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/chat/concierge-coagent-context.tsx"),
    "utf8",
  );

  it("uses the provider connection status instead of private agent runtime fields", () => {
    expect(source).toContain("useCopilotKit");
    expect(source).toContain('copilotkit.runtimeConnectionStatus === "connected"');
    expect(source).not.toContain("runtimeMode");
  });

  it("fails closed when copilotkit context is missing", () => {
    expect(source).toContain("if (!copilotkit");
    expect(source).toContain("return false");
  });

  it("fails closed when runtimeUrl is undefined", () => {
    expect(source).toContain("copilotkit.runtimeUrl === undefined");
    expect(source).toContain("return false");
  });

  it("uses stable useMemo dependencies", () => {
    expect(source).toContain("[agent, copilotkit]");
  });

  it("reads runtimeConnectionStatus and runtimeUrl from copilotkit object", () => {
    expect(source).toContain("copilotkit.runtimeConnectionStatus");
    expect(source).toContain("copilotkit.runtimeUrl");
  });
});