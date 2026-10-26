"use client";

import { useCallback, useRef, useState, type SetStateAction } from "react";
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
  const [draftState, setDraftState] = useState(() => ({
    form: {
      businessName: "",
      category: initialCategory ?? "",
      neighborhood: "",
    } as PartnerSignupFormState,
    revision: 0,
  }));
  const revisionRef = useRef(0);
  const proposalCounter = useRef(0);
  const [suggestion, setSuggestion] = useState<{
    id: number;
    draft: PartnerProfileSuggestion;
    formRevision: number;
  } | null>(null);

  const updateForm = useCallback((next: SetStateAction<PartnerSignupFormState>) => {
    revisionRef.current += 1;
    setDraftState((current) => ({
      form: typeof next === "function" ? next(current.form) : next,
      revision: current.revision + 1,
    }));
  }, []);

  const showSuggestion = useCallback((
    draft: PartnerProfileSuggestion,
    formRevision: number,
  ) => {
    if (formRevision !== revisionRef.current) return;
    proposalCounter.current += 1;
    setSuggestion({ id: proposalCounter.current, draft, formRevision });
  }, []);

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
          context={buildPartnerSignupAiContext(partnerType, draftState.form, draftState.revision)}
          onSuggestion={showSuggestion}
        />
        <div
          data-testid="partner-signup-assistant"
          className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <BusinessUrlImportCard
              onApply={(accepted) =>
                updateForm((current) => applySuggestionToForm(current, accepted))
              }
            />
            {suggestion ? (
              suggestion.formRevision !== draftState.revision ? (
                <div
                  role="alert"
                  data-testid="onboarding-suggestion-stale"
                  className="rounded-xl border border-amber-500/30 p-4 text-sm"
                >
                  <p>Your form changed since this AI suggestion. Ask the assistant for a new suggestion.</p>
                  <button
                    type="button"
                    className="mt-2 underline"
                    onClick={() => setSuggestion(null)}
                  >
                    Dismiss outdated suggestion
                  </button>
                </div>
              ) : (
                <OnboardingAiSuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion.draft}
                  onAccept={(accepted) => {
                    // Recheck the latest revision at click-time; not just render-time.
                    if (revisionRef.current !== suggestion.formRevision) return;
                    updateForm((current) => applySuggestionToForm(current, accepted));
                    setSuggestion(null);
                  }}
                  onIgnore={() => setSuggestion(null)}
                />
              )
            ) : null}
            <PartnerSignupWizard
              partnerType={partnerType}
              draftId={draftId}
              initialCategory={initialCategory}
              isAuthenticated
              loginNextPath={loginNextPath}
              form={draftState.form}
              onFormChange={updateForm}
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
