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
    expect(center).toMatch(/<ChatProvider( persistThread)?>/);
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
  it("replaces CopilotKit's heading-rendered welcome message with a paragraph", () => {
    const center = readComponent("rentals-concierge-center.tsx");
    // CopilotKit hardcodes its welcome message as an <h1> and falls back to default copy when
    // the label is simply removed, so the copy goes through the welcome slot instead.
    expect(center).toContain("welcomeScreen={{ welcomeMessage:");
    expect(center).toContain('data-testid="rc-welcome"');
    expect(center).toMatch(/WelcomeMessageCopy[\s\S]{0,200}?<p/);
    expect(center.match(/<h1\s/g) ?? []).toHaveLength(1);
    expect(center).toContain("I can read your actual rental dashboard");
  });
});

describe("broker conversation survives a reload", () => {
  it("opts into thread persistence and relies on the shared writer", () => {
    const center = readComponent("rentals-concierge-center.tsx");
    // Without this the broker chat runs but never saves, so a refresh erased the conversation.
    expect(center).toContain("<ChatProvider persistThread>");
    const provider = readFileSync(join(ROOT, "..", "..", "chat", "chat-provider.tsx"), "utf8");
    expect(provider).toContain("export function BrokerThreadSaver");
    expect(provider).toContain('fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`');
    // Every other route keeps the old behaviour.
    expect(provider).toMatch(/persistThread = false/);
  });
});
