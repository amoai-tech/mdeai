"use client";

import type React from "react";
import { CopilotChat } from "@copilotkit/react-core/v2";
import { ChatProvider } from "@/components/chat/chat-provider";
import { BrokerWorkspaceToolRenderer } from "@/components/host/rentals/broker-workspace-tool-renderer";
import { cn } from "@/lib/utils";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";
import type { RentalsWorkspaceMode } from "@/components/host/rentals/rentals-dynamic-workspace";

type RentalsConciergeCenterProps = {
  mode: RentalsWorkspaceMode;
};

/** The welcome copy, as a paragraph: the page already has one heading. */
function WelcomeMessageCopy({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <p
      data-testid="rc-welcome"
      className={cn("px-2 text-sm text-muted-foreground", className)}
    >
      I can read your actual rental dashboard. Try: Which viewing requests need my attention? Or:
      Show my listings in Laureles.
    </p>
  );
}

/**
 * SAN-1124 — a real CopilotKit v2 chat using the existing conciergeAgent.
 * /app/rentals and /host/rentals are excluded from the root provider,
 * so this subtree owns the ONE runtime connection on broker pages.
 *
 * Send, Stop and Retry belong to CopilotChat; no parallel chat state,
 * API transport, synthetic replies, or second broker agent.
 */
export function RentalsConciergeCenter({ mode }: RentalsConciergeCenterProps) {
  const deterministic = isDeterministicE2E();
  return (
    <section
      data-testid="rc-center"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Broker concierge chat"
    >
      <div className="shrink-0 border-b border-border px-2 py-2">
        <h1 className="font-serif text-lg font-semibold">Your rentals, run by AI</h1>
        <p className="text-xs text-muted-foreground">
          Ask about your real listings, leads and viewing requests. The assistant is read-only.
          Use the workspace to confirm, decline or publish.
          {mode === "overview" ? " Overview mode." : ""}
        </p>
      </div>
      {deterministic ? (
        <p data-testid="rc-empty" role="status" className="p-4 text-sm text-muted-foreground">
          Live AI is disabled during deterministic browser tests. Broker workspace actions remain available.
        </p>
      ) : (
        <ChatProvider>
          <BrokerWorkspaceToolRenderer />
          <CopilotChat
            agentId="conciergeAgent"
            className="min-h-0 flex-1"
            labels={{
              modalHeaderTitle: "Rentals concierge",
              chatInputPlaceholder: "Ask about your listings, leads or viewings…",
            }}
            // CopilotKit renders its welcome message as a top-level heading, which would give this
            // page two (the real title above, and a paragraph of example prompts). The slot keeps
            // the copy on CopilotKit's own welcome screen -- so it still disappears after the
            // first message -- but as a paragraph instead of a heading.
            welcomeScreen={{ welcomeMessage: WelcomeMessageCopy }}
          />
        </ChatProvider>
      )}
    </section>
  );
}
