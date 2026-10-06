import { describe, expect, it } from "vitest";
import { type OnboardingStepId } from "@/lib/onboarding/contracts";
import { ALL_REQUIRED_FIELD_IDS } from "@/lib/onboarding/definitions";
import {
  assertNever,
  canTransition,
  evaluateOnboarding,
  isFieldPresent,
  isMaterializableIntent,
} from "@/lib/onboarding/state";

const TOTAL_REQUIRED = ALL_REQUIRED_FIELD_IDS.length;

function payload(
  data: Record<string, unknown>,
  stepId: OnboardingStepId = "identity",
) {
  return { payloadVersion: 1, stepId, data };
}

function dataWith(count: number): Record<string, unknown> {
  return Object.fromEntries(
    ALL_REQUIRED_FIELD_IDS.slice(0, count).map((fieldId) => [fieldId, "set"]),
  );
}

describe("evaluateOnboarding", () => {
  it("reports not_started with an empty draft", () => {
    const result = evaluateOnboarding({ step: 1, payload: payload({}) });
    expect(result).toMatchObject({
      stepId: "identity",
      stepIndex: 1,
      completion: 0,
      lifecycle: "not_started",
      readyToSubmit: false,
    });
    expect(result.missingRequiredFieldIds).toEqual([
      "actorRole",
      "fullName",
      "email",
      "phone",
    ]);
  });

  it("computes missing fields for the current step only", () => {
    const identity = evaluateOnboarding({
      step: 1,
      payload: payload({ fullName: "Ada" }),
    });
    expect(identity.missingRequiredFieldIds).toEqual([
      "actorRole",
      "email",
      "phone",
    ]);

    const property = evaluateOnboarding({
      step: 4,
      payload: payload({ fullName: "Ada" }),
    });
    expect(property.stepId).toBe("property");
    expect(property.missingRequiredFieldIds).toEqual([
      "propertyRelationship",
      "propertyType",
    ]);

    const review = evaluateOnboarding({
      step: 8,
      payload: payload({ fullName: "Ada" }),
    });
    expect(review.stepId).toBe("review");
    expect(review.missingRequiredFieldIds).toEqual([]);
  });

  it("computes completion as the rounded share of all required fields", () => {
    expect(TOTAL_REQUIRED).toBe(15);
    expect(
      evaluateOnboarding({ step: 1, payload: payload(dataWith(0)) }).completion,
    ).toBe(0);
    expect(
      evaluateOnboarding({ step: 1, payload: payload(dataWith(1)) }).completion,
    ).toBe(7);
    expect(
      evaluateOnboarding({ step: 1, payload: payload(dataWith(3)) }).completion,
    ).toBe(20);
    expect(
      evaluateOnboarding({ step: 8, payload: payload(dataWith(15)) })
        .completion,
    ).toBe(100);
  });

  it("is in_progress while some but not all required fields are present", () => {
    const result = evaluateOnboarding({
      step: 3,
      payload: payload(dataWith(5)),
    });
    expect(result.lifecycle).toBe("in_progress");
    expect(result.readyToSubmit).toBe(false);
  });

  it("is ready_to_submit only when every required field is present", () => {
    const nearly = evaluateOnboarding({
      step: 8,
      payload: payload(dataWith(14)),
    });
    expect(nearly.readyToSubmit).toBe(false);
    expect(nearly.lifecycle).toBe("in_progress");

    const complete = evaluateOnboarding({
      step: 8,
      payload: payload(dataWith(15)),
    });
    expect(complete.readyToSubmit).toBe(true);
    expect(complete.lifecycle).toBe("ready_to_submit");
    expect(complete.missingRequiredFieldIds).toEqual([]);
  });

  it("reports submitted as its own lifecycle", () => {
    const result = evaluateOnboarding({
      step: 8,
      payload: payload(dataWith(15)),
      submittedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.lifecycle).toBe("submitted");
    expect(result.readyToSubmit).toBe(false);
  });

  it("treats an invalid payload envelope as no data", () => {
    const result = evaluateOnboarding({
      step: 1,
      payload: { payloadVersion: 1, stepId: "identity", data: {}, extra: true },
    });
    expect(result.lifecycle).toBe("not_started");
    expect(result.completion).toBe(0);
  });

  it("clamps an out-of-range persisted step into the canonical range", () => {
    const high = evaluateOnboarding({ step: 99, payload: payload({}) });
    expect(high.stepIndex).toBe(8);
    expect(high.stepId).toBe("review");

    const low = evaluateOnboarding({ step: 0, payload: payload({}) });
    expect(low.stepIndex).toBe(1);
    expect(low.stepId).toBe("identity");
  });

  it("ignores false and empty values when computing missing fields", () => {
    const result = evaluateOnboarding({
      step: 6,
      payload: payload({ photoUrls: [] }),
    });
    expect(result.missingRequiredFieldIds).toEqual(["photoUrls"]);
  });
});

describe("canTransition", () => {
  it("allows exactly one step forward", () => {
    expect(canTransition("identity", "intent")).toBe(true);
    expect(canTransition("price_availability", "review")).toBe(true);
  });

  it("allows any backward move", () => {
    expect(canTransition("intent", "identity")).toBe(true);
    expect(canTransition("review", "identity")).toBe(true);
    expect(canTransition("photos", "address")).toBe(true);
  });

  it("rejects skipping forward", () => {
    expect(canTransition("identity", "about")).toBe(false);
    expect(canTransition("identity", "review")).toBe(false);
    expect(canTransition("intent", "property")).toBe(false);
  });

  it("rejects a no-op transition to the same step", () => {
    expect(canTransition("identity", "identity")).toBe(false);
    expect(canTransition("review", "review")).toBe(false);
  });
});

describe("isMaterializableIntent", () => {
  it("materializes rent", () => {
    expect(isMaterializableIntent("rent")).toBe(true);
  });

  it("does not materialize sell", () => {
    expect(isMaterializableIntent("sell")).toBe(false);
  });
});

describe("isFieldPresent", () => {
  it("treats empty values as absent and real input as present", () => {
    expect(isFieldPresent("  ")).toBe(false);
    expect(isFieldPresent("")).toBe(false);
    expect(isFieldPresent(null)).toBe(false);
    expect(isFieldPresent(undefined)).toBe(false);
    expect(isFieldPresent(false)).toBe(false);
    expect(isFieldPresent([])).toBe(false);
    expect(isFieldPresent({})).toBe(false);

    expect(isFieldPresent("Ada")).toBe(true);
    expect(isFieldPresent(0)).toBe(true);
    expect(isFieldPresent(true)).toBe(true);
    expect(isFieldPresent(["a"])).toBe(true);
    expect(isFieldPresent({ a: 1 })).toBe(true);
  });
});

describe("assertNever", () => {
  it("throws with the offending value", () => {
    expect(() => assertNever("boom" as never)).toThrow(/boom/);
  });
});
