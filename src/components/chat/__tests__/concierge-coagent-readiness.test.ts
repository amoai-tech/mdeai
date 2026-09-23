import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Concierge CopilotKit readiness compatibility guard", () => {
  it("uses the provider connection status instead of private agent runtime fields", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/chat/concierge-coagent-context.tsx"),
      "utf8",
    );

    expect(source).toContain("useCopilotKit");
    expect(source).toContain('copilotkit.runtimeConnectionStatus === "connected"');
    expect(source).not.toContain("runtimeMode");
  });
});
