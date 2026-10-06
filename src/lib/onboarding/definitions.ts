import {
  ONBOARDING_STEP_IDS,
  type OnboardingStepId,
} from "./contracts";

/**
 * SAN-1391 — the one source of truth for step metadata.
 *
 * Order comes from ONBOARDING_STEP_IDS in contracts.ts; labels and stable
 * required-field ids live here and nowhere else. Field ids are stable strings
 * because they double as `partner_drafts.payload.data` keys and as the public
 * contract consumed by future UI steps.
 */

export interface OnboardingStepDefinition {
  readonly id: OnboardingStepId;
  /** 1-based canonical index; persisted as partner_drafts.step. */
  readonly index: number;
  readonly label: string;
  readonly requiredFieldIds: readonly string[];
}

interface OnboardingStepContent {
  readonly label: string;
  readonly requiredFieldIds: readonly string[];
}

const STEP_CONTENT: Readonly<Record<OnboardingStepId, OnboardingStepContent>> = {
  identity: {
    label: "Identity",
    requiredFieldIds: ["actorRole", "fullName", "email", "phone"],
  },
  intent: {
    label: "Intent",
    requiredFieldIds: ["transactionIntent"],
  },
  about: {
    label: "About",
    requiredFieldIds: ["displayName", "bio"],
  },
  property: {
    label: "Property",
    requiredFieldIds: ["propertyRelationship", "propertyType"],
  },
  address: {
    label: "Address",
    requiredFieldIds: ["addressLine", "city", "neighborhood"],
  },
  photos: {
    label: "Photos",
    requiredFieldIds: ["photoUrls"],
  },
  price_availability: {
    label: "Price & availability",
    requiredFieldIds: ["priceAmount", "availability"],
  },
  review: {
    label: "Review",
    requiredFieldIds: [],
  },
};

/**
 * The ordered canonical step list. Built from the id tuple so the order can
 * never drift from the type union.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] =
  ONBOARDING_STEP_IDS.map((id, position) => {
    const content = STEP_CONTENT[id];
    return Object.freeze({
      id,
      index: position + 1,
      label: content.label,
      requiredFieldIds: Object.freeze([...content.requiredFieldIds]),
    });
  });

const BY_ID: Readonly<Record<OnboardingStepId, OnboardingStepDefinition>> =
  Object.fromEntries(
    ONBOARDING_STEPS.map((step) => [step.id, step]),
  ) as Record<OnboardingStepId, OnboardingStepDefinition>;

/** Look up a step's definition by canonical string id. */
export function getOnboardingStep(
  stepId: OnboardingStepId,
): OnboardingStepDefinition {
  return BY_ID[stepId];
}

/** 1-based canonical index for a step id. */
export function onboardingStepIndex(stepId: OnboardingStepId): number {
  return BY_ID[stepId].index;
}

/** Canonical step id at a 1-based index, or undefined when out of range. */
export function onboardingStepIdAt(
  index: number,
): OnboardingStepId | undefined {
  return ONBOARDING_STEPS[index - 1]?.id;
}

/** Required field ids for a step, in stable definition order. */
export function requiredFieldIdsFor(
  stepId: OnboardingStepId,
): readonly string[] {
  return BY_ID[stepId].requiredFieldIds;
}

/** Every required field id across the flow, in step order. */
export const ALL_REQUIRED_FIELD_IDS: readonly string[] = Object.freeze(
  ONBOARDING_STEPS.flatMap((step) => [...step.requiredFieldIds]),
);

/** Narrow an untrusted value to a canonical step id. */
export function isOnboardingStepId(
  value: unknown,
): value is OnboardingStepId {
  return (
    typeof value === "string" &&
    (ONBOARDING_STEP_IDS as readonly string[]).includes(value)
  );
}
