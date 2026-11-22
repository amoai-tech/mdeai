import {
  draftPayloadSchema,
  transactionIntentSchema,
  type OnboardingEvaluationInput,
  type OnboardingLifecycle,
  type OnboardingReadiness,
  type OnboardingStepId,
  type TransactionIntent,
} from "./contracts";
import {
  ALL_REQUIRED_FIELD_IDS,
  ONBOARDING_STEPS,
  isFieldValid,
  onboardingStepIdAt,
  onboardingStepIndex,
  requiredFieldIdsFor,
} from "./definitions";

/**
 * SAN-1391 — pure, deterministic onboarding state machine.
 *
 * No AI, React, CopilotKit, Mastra, or pgvector: this module is the single
 * place that decides readiness from a persisted draft. A field counts only when
 * its value passes the field's validator, so `"banana"` cannot satisfy
 * `actorRole` and `-50` cannot satisfy `priceAmount`.
 */

/** Exhaustiveness guard — a new union member becomes a compile error. */
export function assertNever(value: never, context = "Unexpected value"): never {
  throw new Error(`${context}: ${JSON.stringify(value)}`);
}

/**
 * Only `rent` can currently be materialized into live listing records.
 * `sell` is representable in the draft but intentionally not materializable yet.
 */
export function isMaterializableIntent(intent: TransactionIntent): boolean {
  switch (intent) {
    case "rent":
      return true;
    case "sell":
      return false;
    default:
      return assertNever(intent, "Unknown transaction intent");
  }
}

function clampStepIndex(step: number): number {
  if (!Number.isFinite(step)) return 1;
  const truncated = Math.trunc(step);
  if (truncated < 1) return 1;
  if (truncated > ONBOARDING_STEPS.length) return ONBOARDING_STEPS.length;
  return truncated;
}

function readPayloadData(payload: unknown): Record<string, unknown> {
  const parsed = draftPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data.data : {};
}

/**
 * Evaluate a persisted draft into a readiness snapshot. Deterministic and
 * side-effect free. An unparseable payload contributes no valid fields.
 *
 * `readyToSubmit` additionally requires a materializable intent, so a `sell`
 * draft — whose backend does not exist — can never be counted as ready.
 */
export function evaluateOnboarding(
  input: OnboardingEvaluationInput,
): OnboardingReadiness {
  const stepIndex = clampStepIndex(input.step);
  const step = ONBOARDING_STEPS[stepIndex - 1];
  const data = readPayloadData(input.payload);

  const validIds = new Set(
    ALL_REQUIRED_FIELD_IDS.filter((fieldId) =>
      isFieldValid(fieldId, data[fieldId]),
    ),
  );

  const missingRequiredFieldIds = requiredFieldIdsFor(step.id).filter(
    (fieldId) => !validIds.has(fieldId),
  );

  const totalRequired = ALL_REQUIRED_FIELD_IDS.length;
  const validCount = validIds.size;
  const completion =
    totalRequired === 0 ? 0 : Math.round((validCount / totalRequired) * 100);

  const allRequiredValid = validCount === totalRequired;
  const submitted = input.submittedAt != null;

  const parsedIntent = transactionIntentSchema.safeParse(
    data.transactionIntent,
  );
  const materializable =
    parsedIntent.success && isMaterializableIntent(parsedIntent.data);

  const isReady = allRequiredValid && materializable && !submitted;

  const lifecycle: OnboardingLifecycle = submitted
    ? "submitted"
    : isReady
      ? "ready_to_submit"
      : validCount === 0
        ? "not_started"
        : "in_progress";

  return {
    stepId: step.id,
    stepIndex,
    missingRequiredFieldIds,
    completion,
    lifecycle,
    readyToSubmit: isReady,
  };
}

/**
 * Legal step transitions. Forward is exactly one step AND only when the current
 * step is complete — required fields cannot be skipped. Any backward move (to
 * fix an earlier answer) is allowed. Staying on the same step is not a
 * transition.
 */
export function canTransition(
  from: OnboardingStepId,
  to: OnboardingStepId,
  fromStepComplete = false,
): boolean {
  const fromIndex = onboardingStepIndex(from);
  const toIndex = onboardingStepIndex(to);
  if (toIndex === fromIndex) return false;
  if (toIndex < fromIndex) return true;
  return toIndex === fromIndex + 1 && fromStepComplete;
}

/** True when the current step is complete and a next step exists. */
export function canAdvance(readiness: OnboardingReadiness): boolean {
  return (
    readiness.missingRequiredFieldIds.length === 0 &&
    onboardingStepIdAt(readiness.stepIndex + 1) !== undefined
  );
}
