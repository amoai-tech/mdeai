import type { PartnerSignupFormState } from "@/lib/partners/activate-client";

export type PartnerSignupAiContext = {
  partnerType: string;
  currentForm: PartnerSignupFormState;
  /** Incremented for every user edit so old AI proposals cannot replace new input. */
  formRevision: number;
};

export function buildPartnerSignupAiContext(
  partnerType: string,
  form: PartnerSignupFormState,
  formRevision = 0,
): PartnerSignupAiContext {
  return {
    partnerType,
    formRevision,
    currentForm: {
      businessName: form.businessName,
      category: form.category ?? "",
      neighborhood: form.neighborhood ?? "",
    },
  };
}
