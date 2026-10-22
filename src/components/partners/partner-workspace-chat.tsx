"use client";

import { useEffect } from "react";
import { CopilotChat, useAgentContext } from "@copilotkit/react-core/v2";

import { PARTNER_SELECTION_COOKIE } from "@/lib/partners/partner-selection";

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
  // The cookie is a business selector only. The CopilotKit runtime re-verifies
  // membership with the user-scoped Supabase client before exposing any data.
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${PARTNER_SELECTION_COOKIE}=${encodeURIComponent(partnerId)}; Path=/; SameSite=Lax${secure}`;
    return () => {
      document.cookie =
        `${PARTNER_SELECTION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    };
  }, [partnerId]);

  useAgentContext({
    description:
      "The partner business currently selected in the authenticated profile. Use the read-only getPartnerProfile tool for saved fields; this context is presentation only.",
    value: { businessName, partnerType },
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
