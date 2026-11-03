import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
function readComponent(name: string): string {
  return readFileSync(join(ROOT, name), "utf8");
}

describe("SAN-1124 broker concierge integration contract", () => {
  it("mounts exactly one existing v2 CopilotKit chat on broker pages", () => {
    const center = readComponent("rentals-concierge-center.tsx");
    expect(center).toContain('from "@copilotkit/react-core/v2"');
    expect(center).toContain("<ChatProvider>");
    expect(center).toContain("<BrokerWorkspaceToolRenderer />");
    expect(center).toContain("<CopilotChat");
    expect(center).toContain('agentId="conciergeAgent"');
    expect(center).not.toContain("brokerAgent not live");
    expect(center).not.toContain("disabled\n");
    expect(center).toContain('data-testid="rc-center"');
  });

  it("uses real dashboard attention instead of invented opportunities", () => {
    const shell = readComponent("rentals-concierge-shell.tsx");
    const feed = readComponent("rentals-conversation-history.tsx");
    expect(shell).toContain("<RentalsConversationHistory dashboard={dashboard}");
    expect(feed).toContain("dashboard.attention");
    expect(feed).not.toContain("PHASE_A_OPPORTUNITIES");
  });
});


describe("SAN-1124 tool render key", () => {
  it("registers the actual tool-map key, not the Mastra createTool id", () => {
    const renderer = readComponent("broker-workspace-tool-renderer.tsx");
    expect(renderer).toContain('name: "readBrokerWorkspaceTool"');
    expect(renderer).toContain('agentId: "conciergeAgent"');
    expect(renderer).not.toContain('name: "read-broker-workspace"');
  });
});
