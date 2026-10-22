"use client";

import { CopilotChat, useAgentContext } from "@copilotkit/react-core/v2";
import { useEffect, useState } from "react";

import { getPartnerChatThreadId } from "@/lib/partners/partner-chat-thread";

import { PARTNER_SELECTION_CONTEXT_DESCRIPTION } from "@/lib/partners/partner-selection";

type Props = {
  userId: string;
  partnerId: string;
  businessName: string | null;
  partnerType: string | null;
};

/**
 * SAN-705 — one shared partnerAgent for every partner type.
 *
 * The chat reuses the root MdeCopilotKitProvider. It owns only an explicit
 * per-user/per-business conversation ID, avoiding replaying the general
 * Concierge or another partner’s conversation under this business.
 */
export function PartnerWorkspaceChat({ userId, partnerId, businessName, partnerType }: Props) {
  const [threadId, setThreadId] = useState<string | null>(null);
  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* Browser storage disabled. */ }
    const id = getPartnerChatThreadId(storage, userId, partnerId);
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setThreadId(id); });
    return () => { cancelled = true; };
  }, [userId, partnerId]);

  useAgentContext({
    // Per-request presentation + selection. The server rechecks user membership.
    description: PARTNER_SELECTION_CONTEXT_DESCRIPTION,
    value: { partnerId, businessName, partnerType },
  });

  const welcome = partnerType
    ? "Hi! I can help with your " + partnerType + " partner setup, profile and next steps."
    : "Hi! I can help with your MDE partner signup, profile and next steps.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">MDE partner assistant</p>
        <p className="text-xs text-muted-foreground">
          {businessName
            ? "Helping " + businessName
            : "Ask about signup, your profile or the next step."}
        </p>
      </div>
      {threadId ? (
        <CopilotChat
          key={threadId}
          agentId="partnerAgent"
          threadId={threadId}
          className="min-h-0 flex-1"
          labels={{
            modalHeaderTitle: "MDE partner assistant",
            welcomeMessageText: welcome,
          }}
        />
      ) : (
        <p role="status" className="p-4 text-sm text-muted-foreground">Connecting your business assistant…</p>
      )}
    </div>
  );
}
