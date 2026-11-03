import { z } from "zod";

/**
 * SAN-1391 — canonical onboarding contract.
 *
 * These are the frozen product decisions. Do not invent a parallel state
 * machine, workflow, table, or enum: everything downstream reads this file.
 */

/** WHO is onboarding. An owner is never a broker; a broker is never an owner. */
export const ACTOR_ROLES = ["landlord_owner", "broker_agent"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** WHAT they want to do. `sell` is representable but not yet materializable. */
export const TRANSACTION_INTENTS = ["rent", "sell"] as const;
export type TransactionIntent = (typeof TRANSACTION_INTENTS)[number];

/** How the actor relates to the property. */
export const PROPERTY_RELATIONSHIPS = [
  "owner",
  "authorized_representative",
] as const;
export type PropertyRelationship = (typeof PROPERTY_RELATIONSHIPS)[number];

/** Supported rental property types. Anything else is not a supported listing. */
export const PROPERTY_TYPES = [
  "apartment",
  "house",
  "studio",
  "room",
  "penthouse",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Supported currencies. The rental MVP is COP-only. */
export const CURRENCIES = ["COP"] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * The canonical resumable step order. Index is the step's 1-based position and
 * is exactly what `partner_drafts.step` persists. This array owns the order;
 * definitions.ts owns each step's label and required fields.
 */
export const ONBOARDING_STEP_IDS = [
  "identity",
  "intent",
  "about",
  "property",
  "address",
  "photos",
  "price_availability",
  "review",
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

/** Draft lifecycle. */
export const ONBOARDING_LIFECYCLES = [
  "not_started",
  "in_progress",
  "ready_to_submit",
  "submitted",
] as const;
export type OnboardingLifecycle = (typeof ONBOARDING_LIFECYCLES)[number];

/**
 * Reserved keys inside `partner_drafts.payload`. The canonical string step id
 * lives under `stepId`; the int `partner_drafts.step` mirrors it. The
 * `payloadVersion` integer versions the envelope.
 */
export const PAYLOAD_STEP_ID_KEY = "stepId" as const;
export const PAYLOAD_VERSION_KEY = "payloadVersion" as const;
export const PAYLOAD_DATA_KEY = "data" as const;
export const CURRENT_PAYLOAD_VERSION = 1;

export const actorRoleSchema = z.enum(ACTOR_ROLES);
export const transactionIntentSchema = z.enum(TRANSACTION_INTENTS);
export const propertyRelationshipSchema = z.enum(PROPERTY_RELATIONSHIPS);
export const onboardingStepIdSchema = z.enum(ONBOARDING_STEP_IDS);
export const onboardingLifecycleSchema = z.enum(ONBOARDING_LIFECYCLES);

/**
 * The draft payload envelope. Strict: unknown top-level keys are rejected, so a
 * typo can never quietly persist beside the reserved keys. Field values live
 * under `data` keyed by the stable required-field ids from definitions.ts.
 */
export const draftPayloadSchema = z
  .object({
    [PAYLOAD_VERSION_KEY]: z.literal(CURRENT_PAYLOAD_VERSION),
    [PAYLOAD_STEP_ID_KEY]: onboardingStepIdSchema,
    [PAYLOAD_DATA_KEY]: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type OnboardingDraftPayload = z.infer<typeof draftPayloadSchema>;
export type OnboardingDraftPayloadInput = z.input<typeof draftPayloadSchema>;

/** Result of evaluating a persisted draft. */
export interface OnboardingReadiness {
  /** Canonical string step id (also mirrored under payload.stepId). */
  stepId: OnboardingStepId;
  /** 1-based canonical index (also persisted as partner_drafts.step). */
  stepIndex: number;
  /** Required field ids still absent on the CURRENT step, in definition order. */
  missingRequiredFieldIds: string[];
  /** Percentage of ALL required fields present across the flow, 0..100. */
  completion: number;
  lifecycle: OnboardingLifecycle;
  /** True only when every required field across all steps is present and unsubmitted. */
  readyToSubmit: boolean;
}

/** Input to evaluateOnboarding — the persisted draft shape from partner_drafts. */
export interface OnboardingEvaluationInput {
  /** partner_drafts.step (1-based canonical index). */
  step: number;
  /** partner_drafts.payload (raw jsonb). */
  payload?: unknown;
  /** partner_drafts.submitted_at. */
  submittedAt?: string | null;
}

/**
 * partner_drafts.type values owned by canonical onboarding. The mapping is the
 * key product decision: an owner maps to `landlord` and is NEVER labelled a
 * broker; a broker agent maps to `broker`.
 */
export const PARTNER_DRAFT_TYPES = ["landlord", "broker"] as const;
export type PartnerDraftType = (typeof PARTNER_DRAFT_TYPES)[number];

const ACTOR_ROLE_TO_PARTNER_TYPE: Readonly<
  Record<ActorRole, PartnerDraftType>
> = {
  landlord_owner: "landlord",
  broker_agent: "broker",
};

/** Map an actor role to its persisted partner_drafts.type. */
export function partnerDraftTypeForActorRole(
  role: ActorRole,
): PartnerDraftType {
  return ACTOR_ROLE_TO_PARTNER_TYPE[role];
}

/** A valid, empty envelope for the given step. */
export function emptyDraftPayload(
  stepId: OnboardingStepId = "identity",
): OnboardingDraftPayload {
  return {
    [PAYLOAD_VERSION_KEY]: CURRENT_PAYLOAD_VERSION,
    [PAYLOAD_STEP_ID_KEY]: stepId,
    [PAYLOAD_DATA_KEY]: {},
  };
}
