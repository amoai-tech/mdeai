"use client";

import { CopilotChat, useAgentContext } from "@copilotkit/react-core/v2";

import { PARTNER_SELECTION_CONTEXT_DESCRIPTION } from "@/lib/partners/partner-selection";

type Props = {
  partnerId: string;
  businessName: string | null;
  partnerType: string | null;
};

/**
 * SAN-705 — one shared partnerAgent for every partner type.
 *
 * The chat is rendered under the root MdeCopilotKitProvider. It must not create
 * its own provider or thread: the root provider owns both, and this component
 * only presents the contextual partner surface.
 */
export function PartnerWorkspaceChat({ partnerId, businessName, partnerType }: Props) {
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
      <CopilotChat
        agentId="partnerAgent"
        className="min-h-0 flex-1"
        labels={{
          modalHeaderTitle: "MDE partner assistant",
          welcomeMessageText: welcome,
        }}
      />
    </div>
  );
}
