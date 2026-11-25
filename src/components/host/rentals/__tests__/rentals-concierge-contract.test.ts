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
    // The shared frame owns the app's bottom chat; legacy host uses the
    // same scoped provider without mounting a second chat in app children.
    const ask = readComponent("rentals-ask-mde.tsx");
    expect(ask.match(/<ChatProvider persistThread sessionFallback=/g)).toHaveLength(1);
    expect(ask).toContain('scope="broker"');
    expect(ask).toContain("window.addEventListener(BROKER_ASK_MDE_EVENT, onAsk)");
    const appShell = readFileSync(join(ROOT, "../../app/app-shell.tsx"), "utf8");
    expect(appShell).toContain('href={brokerRentals ? "/app/rentals" : "/chat"}');
    expect(appShell).toContain("window.dispatchEvent(new Event(BROKER_ASK_MDE_EVENT");
    expect(ask).toContain('activated && <BrokerChatProvider');
    expect(shell).toContain("<RentalsAskMde>{children}</RentalsAskMde>");
    expect(shell).toContain("<MdeDashboardRenderProvider>");
    expect(shell).toContain('if (basePath === "/app/rentals")');
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
    // SAN-1685: the standalone Concierge keeps the page-level h1; the embedded
    // bottom chat renders a secondary heading because the dashboard owns the h1.
    expect(center).toContain('const Heading = embedded ? "h2" : "h1";');
    expect(center).toContain("<Heading className=");
    expect(center).not.toMatch(/^\s*<h1\s/m);
    expect(center).toContain("I can read your actual rental dashboard");
  });
});

describe("broker conversation survives a reload", () => {
  it("opts into thread persistence and relies on the shared writer", () => {
    const ask = readComponent("rentals-ask-mde.tsx");
    // Without this the broker chat runs but never saves, so a refresh erased the conversation.
    expect(ask).toContain("<ChatProvider persistThread sessionFallback=");
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
    // SAN-1710/SAN-1685: the /app tree renders one full-width Overview and the
    // frame owns the chat; the legacy host keeps its own full-width overview
    // branch and its unchanged three-panel concierge path.
    expect(shell).toContain('if (basePath === "/app/rentals")');
    expect(shell).toContain('if (workspaceMode === "overview")');
    expect(shell).toContain("<RentalsDynamicWorkspace");
    expect(shell).toContain('surfaceId="rentals-workspace-header"');
    expect(readComponent("rentals-ask-mde.tsx")).toContain('data-testid="rentals-ask-mde-slot"');
    expect(readComponent("host-rentals-nav.tsx")).toContain('aria-current={active ? "page" : undefined}');
  });
});
