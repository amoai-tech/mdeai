"use client";

import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  type CopilotKitProviderProps,
} from "@copilotkit/react-core/v2";

import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";

type CopilotErrorEvent = Parameters<NonNullable<CopilotKitProviderProps["onError"]>>[0];

function handlePartnerCopilotError(errorEvent: CopilotErrorEvent): void {
  console.error("[partnerAgent copilot error]", errorEvent);
}

type Props = {
  businessName: string | null;
  partnerType: string | null;
};

/**
 * SAN-705 — one shared partnerAgent for every partner type, reusing the
 * existing CopilotKit v2 provider and AG-UI runtime.
 */
export function PartnerWorkspaceChat({ businessName, partnerType }: Props) {
  const welcome = partnerType
    ? "Hi! I can help with your " + partnerType + " partner setup, profile and next steps."
    : "Hi! I can help with your MDE partner signup, profile and next steps.";

  return (
    <CopilotKitProvider
      {...getCopilotKitClientProps("partnerAgent")}
      enableInspector={false}
      onError={handlePartnerCopilotError}
    >
      <CopilotChatConfigurationProvider agentId="partnerAgent">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              MDE partner assistant
            </p>
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
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}
