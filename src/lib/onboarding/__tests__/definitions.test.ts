import { describe, expect, it } from "vitest";
import { ONBOARDING_STEP_IDS } from "@/lib/onboarding/contracts";
import {
  ALL_REQUIRED_FIELD_IDS,
  ONBOARDING_STEPS,
  getOnboardingStep,
  isOnboardingStepId,
  onboardingStepIdAt,
  onboardingStepIndex,
  parseDraftWritePayload,
  requiredFieldIdsFor,
} from "@/lib/onboarding/definitions";

describe("onboarding definitions", () => {
  it("is the single ordered source of truth for the 8 steps", () => {
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      ...ONBOARDING_STEP_IDS,
    ]);
  });

  it("assigns a stable 1-based index in order", () => {
    ONBOARDING_STEPS.forEach((step, position) => {
      expect(step.index).toBe(position + 1);
    });
    expect(ONBOARDING_STEPS[0].index).toBe(1);
    expect(ONBOARDING_STEPS[7].index).toBe(8);
  });

  it("gives every step a non-empty label", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("round-trips string step id <-> 1-based int index", () => {
    for (const stepId of ONBOARDING_STEP_IDS) {
      const index = onboardingStepIndex(stepId);
      expect(onboardingStepIdAt(index)).toBe(stepId);
    }
  });

  it("returns undefined for an out-of-range index", () => {
    expect(onboardingStepIdAt(0)).toBeUndefined();
    expect(onboardingStepIdAt(9)).toBeUndefined();
  });

  it("keeps required-field ids globally unique", () => {
    expect(new Set(ALL_REQUIRED_FIELD_IDS).size).toBe(
      ALL_REQUIRED_FIELD_IDS.length,
    );
  });

  it("exposes required fields per step in definition order", () => {
    expect(requiredFieldIdsFor("identity")).toEqual([
      "actorRole",
      "fullName",
      "email",
      "phone",
    ]);
    expect(requiredFieldIdsFor("intent")).toEqual(["transactionIntent"]);
    expect(requiredFieldIdsFor("photos")).toEqual(["photoUrls"]);
  });

  it("does not block the review step on required fields", () => {
    expect(requiredFieldIdsFor("review")).toEqual([]);
  });

  it("matches the flattened ALL_REQUIRED_FIELD_IDS", () => {
    const flattened = ONBOARDING_STEPS.flatMap((step) => [
      ...step.requiredFieldIds,
    ]);
    expect(ALL_REQUIRED_FIELD_IDS).toEqual(flattened);
  });

  it("narrows untrusted values to a canonical step id", () => {
    expect(isOnboardingStepId("address")).toBe(true);
    expect(isOnboardingStepId("nope")).toBe(false);
    expect(isOnboardingStepId(3)).toBe(false);
    expect(isOnboardingStepId(null)).toBe(false);
  });

  it("looks up a step definition by id", () => {
    expect(getOnboardingStep("review").label).toBe("Review");
    expect(getOnboardingStep("property").index).toBe(4);
  });

  describe("parseDraftWritePayload", () => {
    const validPayload = {
      payloadVersion: 1,
      stepId: "photos" as const,
      data: {},
    };

    it("accepts a payload whose stepId matches the persisted step", () => {
      expect(parseDraftWritePayload(6, validPayload)).toEqual(validPayload);
    });

    it("rejects a step that disagrees with the payload stepId", () => {
      expect(() => parseDraftWritePayload(1, validPayload)).toThrow(
        /does not match/,
      );
    });

    it("rejects an out-of-range step (the DB allows 9 and 10)", () => {
      expect(() => parseDraftWritePayload(9, validPayload)).toThrow(
        /does not match/,
      );
    });

    it("rejects an unsupported payload version or unknown keys", () => {
      expect(() =>
        parseDraftWritePayload(6, { ...validPayload, payloadVersion: 2 }),
      ).toThrow();
      expect(() =>
        parseDraftWritePayload(6, { ...validPayload, unexpected: true }),
      ).toThrow();
    });
  });
});
