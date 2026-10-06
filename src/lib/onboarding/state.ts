import {
  draftPayloadSchema,
  type OnboardingEvaluationInput,
  type OnboardingLifecycle,
  type OnboardingReadiness,
  type OnboardingStepId,
  type TransactionIntent,
} from "./contracts";
import {
  ALL_REQUIRED_FIELD_IDS,
  ONBOARDING_STEPS,
  onboardingStepIndex,
  requiredFieldIdsFor,
} from "./definitions";

/**
 * SAN-1391 — pure, deterministic onboarding state machine.
 *
 * No AI, React, CopilotKit, Mastra, or pgvector: this module is the single
 * place that decides readiness from a persisted draft.
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

/**
 * A field counts as present when it carries real user input. `false`, empty
 * strings, empty arrays, and empty objects are treated as absent — a boolean
 * field only becomes present when it is confirmed true.
 */
export function isFieldPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(isFieldPresent);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
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
 * side-effect free. An unparseable payload contributes no present fields.
 */
export function evaluateOnboarding(
  input: OnboardingEvaluationInput,
): OnboardingReadiness {
  const stepIndex = clampStepIndex(input.step);
  const step = ONBOARDING_STEPS[stepIndex - 1];
  const data = readPayloadData(input.payload);

  const presentIds = new Set(
    ALL_REQUIRED_FIELD_IDS.filter((fieldId) => isFieldPresent(data[fieldId])),
  );

  const missingRequiredFieldIds = requiredFieldIdsFor(step.id).filter(
    (fieldId) => !presentIds.has(fieldId),
  );

  const totalRequired = ALL_REQUIRED_FIELD_IDS.length;
  const presentCount = presentIds.size;
  const completion =
    totalRequired === 0
      ? 0
      : Math.round((presentCount / totalRequired) * 100);

  const allRequiredPresent = presentCount === totalRequired;
  const submitted = input.submittedAt != null;

  const lifecycle: OnboardingLifecycle = submitted
    ? "submitted"
    : allRequiredPresent
      ? "ready_to_submit"
      : presentCount === 0
        ? "not_started"
        : "in_progress";

  return {
    stepId: step.id,
    stepIndex,
    missingRequiredFieldIds,
    completion,
    lifecycle,
    readyToSubmit: allRequiredPresent && !submitted,
  };
}

/**
 * Legal step transitions. Forward is exactly one step — required fields cannot
 * be skipped. Any backward move (to fix an earlier answer) is allowed. Staying
 * on the same step is not a transition.
 */
export function canTransition(
  from: OnboardingStepId,
  to: OnboardingStepId,
): boolean {
  const fromIndex = onboardingStepIndex(from);
  const toIndex = onboardingStepIndex(to);
  if (toIndex === fromIndex) return false;
  if (toIndex < fromIndex) return true;
  return toIndex === fromIndex + 1;
}
