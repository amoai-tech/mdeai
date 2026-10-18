"use client";

import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

import {
  parsePartnerProfileSuggestion,
  type PartnerProfileSuggestion,
} from "@/lib/onboarding/ai-suggestion";
import type { PartnerSignupAiContext } from "@/lib/onboarding/ai-context";

const suggestionParameters = z.object({
  businessName: z.string().optional(),
  category: z.string().optional(),
  neighborhood: z.string().optional(),
  reason: z.string().optional(),
});

type Props = {
  context: PartnerSignupAiContext;
  onSuggestion: (suggestion: PartnerProfileSuggestion) => void;
};

/**
 * SAN-709 — publishes the current signup form to the partner agent and exposes
 * one frontend tool that returns field suggestions for user review. The tool
 * never writes to Supabase; it only hands validated values to the UI.
 */
export function OnboardingCopilotBridge({ context, onSuggestion }: Props) {
  useAgentContext({
    description:
      "The partner's current signup form and type. Suggest only fields the partner has actually described; never invent business facts.",
    value: context,
  });

  useFrontendTool(
    {
      name: "suggest_partner_profile",
      description:
        "Suggest partner signup fields for the user to review. Use only facts the user provided. Do not save anything.",
      parameters: suggestionParameters,
      handler: async (args) => {
        const suggestion = parsePartnerProfileSuggestion(args);
        if (!suggestion) {
          return {
            ok: false,
            reason: "Suggestion did not contain valid profile fields",
          };
        }
        onSuggestion(suggestion);
        return { ok: true };
      },
    },
    [onSuggestion],
  );

  return null;
}
