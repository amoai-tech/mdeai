"use client";

import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

import {
  isCurrentFormRevision,
  parseRevisedPartnerSuggestion,
  type PartnerProfileSuggestion,
} from "@/lib/onboarding/ai-suggestion";
import type { PartnerSignupAiContext } from "@/lib/onboarding/ai-context";

const suggestionParameters = z.object({
  formRevision: z.number().int().nonnegative(),
  businessName: z.string().optional(),
  category: z.string().optional(),
  neighborhood: z.string().optional(),
  reason: z.string().optional(),
}).strict();

type Props = {
  context: PartnerSignupAiContext;
  onSuggestion: (suggestion: PartnerProfileSuggestion, formRevision: number) => void;
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
        if (!isCurrentFormRevision(args.formRevision, context.formRevision)) {
          return { ok: false, reason: "The signup form changed. Ask for a new suggestion." };
        }
        const suggestion = parseRevisedPartnerSuggestion(args, context.formRevision);
        if (!suggestion) {
          return { ok: false, reason: "Suggestion did not contain valid profile fields" };
        }
        onSuggestion(suggestion, args.formRevision);
        return { ok: true, state: "awaiting_user_review", saved: false };
      },
    },
    [onSuggestion, context.formRevision],
  );

  return null;
}
