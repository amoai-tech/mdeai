"use client";

import { useState } from "react";
import {
  CopilotChat,
  CopilotChatConfigurationProvider,
  CopilotKitProvider,
  type CopilotKitProviderProps,
} from "@copilotkit/react-core/v2";

import { OnboardingAiSuggestionCard } from "@/components/onboarding/onboarding-ai-suggestion-card";
import { OnboardingCopilotBridge } from "@/components/onboarding/onboarding-copilot-bridge";
import { BusinessUrlImportCard } from "@/components/onboarding/business-url-import-card";
import { PartnerSignupWizard } from "@/components/partners/partner-signup-wizard";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import {
  applySuggestionToForm,
  type PartnerProfileSuggestion,
} from "@/lib/onboarding/ai-suggestion";
import { buildPartnerSignupAiContext } from "@/lib/onboarding/ai-context";
import type { PartnerSignupFormState } from "@/lib/partners/activate-client";
import type { PartnerSignupType } from "@/lib/partners/partner-types";

type CopilotErrorEvent = Parameters<NonNullable<CopilotKitProviderProps["onError"]>>[0];

function handleSignupCopilotError(errorEvent: CopilotErrorEvent): void {
  console.error("[partnerAgent signup copilot error]", errorEvent);
}

type Props = {
  partnerType: PartnerSignupType;
  draftId?: string;
  initialCategory?: string;
  isAuthenticated: boolean;
  loginNextPath: string;
};

/**
 * SAN-709 — the existing signup wizard plus the partner assistant. The AI only
 * proposes values through a frontend tool; the partner accepts, edits or ignores
 * them before the existing activation API is called.
 */
export function PartnerSignupAssistant({
  partnerType,
  draftId,
  initialCategory,
  isAuthenticated,
  loginNextPath,
}: Props) {
  const [form, setForm] = useState<PartnerSignupFormState>({
    businessName: "",
    category: initialCategory ?? "",
    neighborhood: "",
  });
  const [suggestion, setSuggestion] = useState<PartnerProfileSuggestion | null>(null);

  if (!isAuthenticated) {
    return (
      <PartnerSignupWizard
        partnerType={partnerType}
        draftId={draftId}
        initialCategory={initialCategory}
        isAuthenticated={false}
        loginNextPath={loginNextPath}
      />
    );
  }

  return (
    <CopilotKitProvider
      {...getCopilotKitClientProps("partnerAgent")}
      enableInspector={false}
      onError={handleSignupCopilotError}
    >
      <CopilotChatConfigurationProvider agentId="partnerAgent">
        <OnboardingCopilotBridge
          context={buildPartnerSignupAiContext(partnerType, form)}
          onSuggestion={setSuggestion}
        />
        <div
          data-testid="partner-signup-assistant"
          className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <BusinessUrlImportCard
              onApply={(accepted) =>
                setForm((current) => applySuggestionToForm(current, accepted))
              }
            />
            {suggestion ? (
              <OnboardingAiSuggestionCard
                suggestion={suggestion}
                onAccept={(accepted) => {
                  setForm((current) => applySuggestionToForm(current, accepted));
                  setSuggestion(null);
                }}
                onIgnore={() => setSuggestion(null)}
              />
            ) : null}
            <PartnerSignupWizard
              partnerType={partnerType}
              draftId={draftId}
              initialCategory={initialCategory}
              isAuthenticated
              loginNextPath={loginNextPath}
              form={form}
              onFormChange={setForm}
            />
          </div>
          <aside
            aria-label="Partner assistant"
            className="flex h-[60vh] min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm lg:sticky lg:top-20 lg:h-[32rem]"
          >
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-semibold text-foreground">
                Setup assistant
              </p>
              <p className="text-xs text-muted-foreground">
                Ask for help; suggestions stay proposals until you accept them.
              </p>
            </div>
            <CopilotChat
              agentId="partnerAgent"
              className="min-h-0 flex-1"
              labels={{
                modalHeaderTitle: "Partner setup assistant",
                welcomeMessageText:
                  "Tell me about your business and I can suggest signup fields you can review, edit or ignore.",
              }}
            />
          </aside>
        </div>
      </CopilotChatConfigurationProvider>
    </CopilotKitProvider>
  );
}
