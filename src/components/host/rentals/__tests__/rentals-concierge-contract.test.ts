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

describe("one top-level heading on the broker concierge", () => {
  it("renders the welcome copy as a paragraph, not as CopilotKit's <h1>", () => {
    const center = readComponent("rentals-concierge-center.tsx");
    // The page already has the real h1 "Your rentals, run by AI"; CopilotKit renders
    // `welcomeMessageText` as a second <h1>, so the copy lives outside that label now.
    // The label binding is what CopilotKit turns into an <h1>; a comment may name it.
    expect(center).not.toMatch(/welcomeMessageText:\s*"/);
    expect(center).toContain('data-testid="rc-welcome"');
    // The welcome copy must sit inside a <p>, which is what keeps it out of the heading outline.
    const paragraph = center.slice(center.lastIndexOf("<p", center.indexOf('data-testid="rc-welcome"')));
    expect(paragraph.slice(0, 120)).toContain("<p");
    expect(center.match(/<h1\s/g) ?? []).toHaveLength(1);
    expect(center).toContain("I can read your actual rental dashboard");
  });
});
