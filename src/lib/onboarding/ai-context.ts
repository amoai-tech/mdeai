import type { PartnerSignupFormState } from "@/lib/partners/activate-client";

export type PartnerSignupAiContext = {
  partnerType: string;
  currentForm: PartnerSignupFormState;
};

export function buildPartnerSignupAiContext(
  partnerType: string,
  form: PartnerSignupFormState,
): PartnerSignupAiContext {
  return {
    partnerType,
    currentForm: {
      businessName: form.businessName,
      category: form.category ?? "",
      neighborhood: form.neighborhood ?? "",
    },
  };
}
