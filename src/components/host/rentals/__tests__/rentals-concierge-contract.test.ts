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
    const shell = readComponent("rentals-concierge-shell.tsx");
    // One live provider per concierge route: app chat only, legacy host
    // retains its standalone provider. The shared frame never starts chat.
    expect(shell.match(/<ChatProvider persistThread sessionFallback=/g)).toHaveLength(2);
    expect(shell).toContain('basePath === "/app/rentals" ? workspace : (');
    const frame = shell.split("export function RentalsBrokerFrame")[1].split("export function RentalsConciergeShell")[0];
    expect(frame).toContain("<MdeDashboardRenderProvider>");
    expect(frame).not.toContain("<ChatProvider");
    expect(frame).toContain("{children}");
    expect(shell).toContain('basePath !== "/app/rentals" && <HostRentalsNav');
    expect(center).not.toContain("<ChatProvider");
    expect(shell).toContain("<RentalsConciergeCenter");
    expect(shell).toContain("<RentalsDynamicWorkspace");
    const appLayout = readFileSync(join(ROOT, "../../../app/app/rentals/(broker)/layout.tsx"), "utf8");
    expect(appLayout).toContain("<RentalsBrokerFrame>{children}</RentalsBrokerFrame>");
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
    const shell = readComponent("rentals-concierge-shell.tsx");
    // Without this the broker chat runs but never saves, so a refresh erased the conversation.
    expect(shell).toContain("<ChatProvider persistThread sessionFallback=");
    const provider = readFileSync(join(ROOT, "..", "..", "chat", "chat-provider.tsx"), "utf8");
    expect(provider).toContain("export function BrokerThreadSaver");
    expect(provider).toContain('fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`');
    // Every other route keeps the old behaviour.
    expect(provider).toMatch(/persistThread = false/);
  });
});

describe("SAN-1683 shared route frame", () => {
  it("renders the selected Overview instead of hiding it behind mobile Chat", () => {
    const shell = readComponent("rentals-concierge-shell.tsx");
    expect(shell).toContain('basePath === "/app/rentals" && workspaceMode === "overview"');
    expect(shell).toContain('surfaceId="rentals-workspace-header"');
    expect(shell).toContain('data-testid="rentals-ask-mde-slot"');
    expect(readComponent("host-rentals-nav.tsx")).toContain('aria-current={active ? "page" : undefined}');
  });
});
