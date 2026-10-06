import { z } from "zod";
import {
  ACTOR_ROLES,
  ONBOARDING_STEP_IDS,
  PROPERTY_RELATIONSHIPS,
  TRANSACTION_INTENTS,
  draftPayloadSchema,
  type OnboardingDraftPayload,
  type OnboardingStepId,
} from "./contracts";

/**
 * SAN-1391 — the one source of truth for step metadata and field validation.
 *
 * Order comes from ONBOARDING_STEP_IDS in contracts.ts; labels, required fields
 * and each field's validator live here and nowhere else. Field ids are stable
 * strings because they double as `partner_drafts.payload.data` keys and as the
 * public contract consumed by future UI steps.
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

/**
 * What a real rental partner must supply. Deliberately includes the facts a
 * listing cannot be published without: location identity (placeId), the rental
 * shape (bedrooms/bathrooms), currency, and the two rights attestations.
 * `bio` is optional prose and is not required anywhere.
 */
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
    requiredFieldIds: ["displayName"],
  },
  property: {
    label: "Property",
    requiredFieldIds: [
      "propertyRelationship",
      "propertyType",
      "bedrooms",
      "bathrooms",
    ],
  },
  address: {
    label: "Address",
    requiredFieldIds: ["addressLine", "city", "neighborhood", "placeId"],
  },
  photos: {
    label: "Photos",
    requiredFieldIds: ["photoUrls", "photoPublicationRightsConfirmed"],
  },
  price_availability: {
    label: "Price & availability",
    requiredFieldIds: ["priceAmount", "currency", "availability"],
  },
  review: {
    label: "Review",
    requiredFieldIds: ["listingRightsConfirmed"],
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

/**
 * One validator per required field. Presence is not truth: `"banana"` is not an
 * `actorRole` and `-50` is not a price, so readiness is computed from these
 * schemas rather than from whether a key exists.
 *
 * `availability` is the ISO date the listing becomes available. Rights fields
 * are attestations the partner must affirm — `false` is not a valid value.
 */
export const FIELD_VALIDATORS: Readonly<
  Record<string, z.ZodType<unknown>>
> = Object.freeze({
  actorRole: z.enum(ACTOR_ROLES),
  fullName: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7),
  transactionIntent: z.enum(TRANSACTION_INTENTS),
  displayName: z.string().trim().min(1),
  propertyRelationship: z.enum(PROPERTY_RELATIONSHIPS),
  propertyType: z.string().trim().min(1),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().int().min(0),
  addressLine: z.string().trim().min(1),
  city: z.string().trim().min(1),
  neighborhood: z.string().trim().min(1),
  placeId: z.string().trim().min(1),
  photoUrls: z.array(z.string().trim().min(1)).min(1),
  photoPublicationRightsConfirmed: z.literal(true),
  priceAmount: z.number().int().positive(),
  currency: z.string().trim().length(3),
  availability: z.string().trim().min(1),
  listingRightsConfirmed: z.literal(true),
});

/** True only when `value` is a valid value for `fieldId`. */
export function isFieldValid(fieldId: string, value: unknown): boolean {
  const validator = FIELD_VALIDATORS[fieldId];
  return validator ? validator.safeParse(value).success : false;
}

/** Narrow an untrusted value to a canonical step id. */
export function isOnboardingStepId(
  value: unknown,
): value is OnboardingStepId {
  return (
    typeof value === "string" &&
    (ONBOARDING_STEP_IDS as readonly string[]).includes(value)
  );
}

/**
 * Parse a draft payload for a write and require it to match the persisted
 * 1-based step. Rejects an unsupported payload version, unknown keys, an
 * out-of-range step, and a step/payload mismatch before anything reaches the
 * database.
 */
export function parseDraftWritePayload(
  step: number,
  payload: unknown,
): OnboardingDraftPayload {
  const parsed = draftPayloadSchema.parse(payload);
  if (onboardingStepIdAt(step) !== parsed.stepId) {
    throw new Error(
      `draft step ${step} does not match payload.stepId "${parsed.stepId}"`,
    );
  }
  return parsed;
}

/**
 * Parse a payload read from storage. Throws instead of falling back to an empty
 * draft, so a corrupt or stale row is reported rather than silently discarded.
 */
export function parseStoredDraftPayload(
  payload: unknown,
): OnboardingDraftPayload {
  return draftPayloadSchema.parse(payload);
}
