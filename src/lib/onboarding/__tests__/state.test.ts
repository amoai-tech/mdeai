import { describe, expect, it } from "vitest";
import { type OnboardingStepId } from "@/lib/onboarding/contracts";
import { ALL_REQUIRED_FIELD_IDS } from "@/lib/onboarding/definitions";
import {
  assertNever,
  canAdvance,
  canTransition,
  evaluateOnboarding,
  isMaterializableIntent,
} from "@/lib/onboarding/state";

const TOTAL_REQUIRED = ALL_REQUIRED_FIELD_IDS.length;

/** One genuinely valid value per required field, in ALL_REQUIRED_FIELD_IDS order. */
const VALID: Record<string, unknown> = {
  actorRole: "landlord_owner",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+573001234567",
  transactionIntent: "rent",
  displayName: "Ada",
  propertyRelationship: "owner",
  propertyType: "apartment",
  bedrooms: 2,
  bathrooms: 1,
  addressLine: "Calle 10 #40-20",
  city: "Medellín",
  neighborhood: "Laureles",
  placeId: "ChIJabc123",
  photoUrls: ["https://example.com/a.jpg"],
  photoPublicationRightsConfirmed: true,
  priceAmount: 3_800_000,
  currency: "COP",
  availability: "2026-11-01",
  listingRightsConfirmed: true,
};

function payload(
  data: Record<string, unknown>,
  stepId: OnboardingStepId = "identity",
) {
  return { payloadVersion: 1, stepId, data };
}

/** The first `count` required fields, each with a valid value. */
function dataWith(count: number): Record<string, unknown> {
  return Object.fromEntries(
    ALL_REQUIRED_FIELD_IDS.slice(0, count).map((fieldId) => [
      fieldId,
      VALID[fieldId],
    ]),
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
      "bedrooms",
      "bathrooms",
    ]);

    const review = evaluateOnboarding({
      step: 8,
      payload: payload({ fullName: "Ada" }),
    });
    expect(review.stepId).toBe("review");
    expect(review.missingRequiredFieldIds).toEqual(["listingRightsConfirmed"]);
  });

  it("computes completion as the rounded share of all required fields", () => {
    expect(TOTAL_REQUIRED).toBe(20);
    expect(
      evaluateOnboarding({ step: 1, payload: payload(dataWith(0)) }).completion,
    ).toBe(0);
    expect(
      evaluateOnboarding({ step: 1, payload: payload(dataWith(1)) }).completion,
    ).toBe(5);
    expect(
      evaluateOnboarding({ step: 1, payload: payload(dataWith(3)) }).completion,
    ).toBe(15);
    expect(
      evaluateOnboarding({ step: 8, payload: payload(dataWith(20)) }).completion,
    ).toBe(100);
  });

  it("is in_progress while some but not all required fields are valid", () => {
    const result = evaluateOnboarding({
      step: 3,
      payload: payload(dataWith(5)),
    });
    expect(result.lifecycle).toBe("in_progress");
    expect(result.readyToSubmit).toBe(false);
  });

  it("is ready_to_submit only when every required field is valid", () => {
    const nearly = evaluateOnboarding({
      step: 8,
      payload: payload(dataWith(19)),
    });
    expect(nearly.readyToSubmit).toBe(false);
    expect(nearly.lifecycle).toBe("in_progress");

    const complete = evaluateOnboarding({
      step: 8,
      payload: payload(dataWith(20)),
    });
    expect(complete.readyToSubmit).toBe(true);
    expect(complete.lifecycle).toBe("ready_to_submit");
    expect(complete.missingRequiredFieldIds).toEqual([]);
  });

  it("never treats a non-materializable intent (sell) as ready", () => {
    const sell = { ...dataWith(20), transactionIntent: "sell" };
    const result = evaluateOnboarding({ step: 8, payload: payload(sell) });
    expect(result.completion).toBe(100);
    expect(result.readyToSubmit).toBe(false);
    expect(result.lifecycle).toBe("in_progress");
  });

  it("rejects present-but-invalid values rather than trusting presence", () => {
    const result = evaluateOnboarding({
      step: 1,
      payload: payload({
        actorRole: "banana",
        fullName: "Ada",
        email: "ada@example.com",
        phone: "+573001234567",
      }),
    });
    expect(result.missingRequiredFieldIds).toEqual(["actorRole"]);
  });

  it("requires a real photo and the publication-rights attestation", () => {
    const result = evaluateOnboarding({
      step: 6,
      payload: payload({
        photoUrls: [""],
        photoPublicationRightsConfirmed: false,
      }),
    });
    expect(result.missingRequiredFieldIds).toEqual([
      "photoUrls",
      "photoPublicationRightsConfirmed",
    ]);
  });

  it("reports submitted as its own lifecycle", () => {
    const result = evaluateOnboarding({
      step: 8,
      payload: payload(dataWith(20)),
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
});

describe("canTransition", () => {
  it("allows one step forward only when the current step is complete", () => {
    expect(canTransition("identity", "intent", true)).toBe(true);
    expect(canTransition("price_availability", "review", true)).toBe(true);
    expect(canTransition("identity", "intent", false)).toBe(false);
    // Default is "not known complete", so an empty Identity cannot advance.
    expect(canTransition("identity", "intent")).toBe(false);
  });

  it("allows any backward move regardless of completeness", () => {
    expect(canTransition("intent", "identity")).toBe(true);
    expect(canTransition("review", "identity")).toBe(true);
    expect(canTransition("photos", "address")).toBe(true);
  });

  it("rejects skipping forward", () => {
    expect(canTransition("identity", "about", true)).toBe(false);
    expect(canTransition("identity", "review", true)).toBe(false);
    expect(canTransition("intent", "property", true)).toBe(false);
  });

  it("rejects a no-op transition to the same step", () => {
    expect(canTransition("identity", "identity", true)).toBe(false);
    expect(canTransition("review", "review", true)).toBe(false);
  });
});

describe("canAdvance", () => {
  it("advances only when the current step is complete and a next step exists", () => {
    const incomplete = evaluateOnboarding({ step: 1, payload: payload({}) });
    expect(canAdvance(incomplete)).toBe(false);

    const completeIdentity = evaluateOnboarding({
      step: 1,
      payload: payload({
        actorRole: "landlord_owner",
        fullName: "Ada",
        email: "ada@example.com",
        phone: "+573001234567",
      }),
    });
    expect(canAdvance(completeIdentity)).toBe(true);

    const completeReview = evaluateOnboarding({
      step: 8,
      payload: payload(dataWith(20)),
    });
    expect(canAdvance(completeReview)).toBe(false);
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

describe("assertNever", () => {
  it("throws with the offending value", () => {
    expect(() => assertNever("boom" as never)).toThrow(/boom/);
  });
});
