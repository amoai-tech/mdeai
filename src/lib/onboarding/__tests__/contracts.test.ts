import { describe, expect, it } from "vitest";
import {
  ACTOR_ROLES,
  ONBOARDING_LIFECYCLES,
  ONBOARDING_STEP_IDS,
  PARTNER_DRAFT_TYPES,
  PROPERTY_RELATIONSHIPS,
  TRANSACTION_INTENTS,
  draftPayloadSchema,
  emptyDraftPayload,
  partnerDraftTypeForActorRole,
} from "@/lib/onboarding/contracts";

describe("onboarding contracts", () => {
  it("freezes the canonical actor roles", () => {
    expect(ACTOR_ROLES).toEqual(["landlord_owner", "broker_agent"]);
  });

  it("freezes the canonical transaction intents", () => {
    expect(TRANSACTION_INTENTS).toEqual(["rent", "sell"]);
  });

  it("freezes the canonical property relationships", () => {
    expect(PROPERTY_RELATIONSHIPS).toEqual([
      "owner",
      "authorized_representative",
    ]);
  });

  it("declares exactly the 8 canonical steps in order", () => {
    expect(ONBOARDING_STEP_IDS).toEqual([
      "identity",
      "intent",
      "about",
      "property",
      "address",
      "photos",
      "price_availability",
      "review",
    ]);
  });

  it("freezes the canonical lifecycles", () => {
    expect(ONBOARDING_LIFECYCLES).toEqual([
      "not_started",
      "in_progress",
      "ready_to_submit",
      "submitted",
    ]);
  });

  it("maps an owner to landlord and never to broker", () => {
    expect(partnerDraftTypeForActorRole("landlord_owner")).toBe("landlord");
    expect(PARTNER_DRAFT_TYPES).toContain("landlord");
  });

  it("maps a broker agent to broker and never to landlord", () => {
    expect(partnerDraftTypeForActorRole("broker_agent")).toBe("broker");
    expect(PARTNER_DRAFT_TYPES).toContain("broker");
  });

  it("never conflates the owner and broker types", () => {
    const owner = partnerDraftTypeForActorRole("landlord_owner");
    const broker = partnerDraftTypeForActorRole("broker_agent");
    expect(owner).not.toBe(broker);
    expect(owner).not.toBe("broker");
    expect(broker).not.toBe("landlord");
  });

  it("accepts a valid draft payload envelope", () => {
    const result = draftPayloadSchema.safeParse({
      payloadVersion: 1,
      stepId: "identity",
      data: { fullName: "Ada" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level keys (strict object)", () => {
    const result = draftPayloadSchema.safeParse({
      payloadVersion: 1,
      stepId: "identity",
      data: {},
      unexpected: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe("unrecognized_keys");
    }
  });

  it("rejects an unknown step id", () => {
    const result = draftPayloadSchema.safeParse({
      payloadVersion: 1,
      stepId: "not_a_step",
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive or non-integer payload version", () => {
    expect(
      draftPayloadSchema.safeParse({
        payloadVersion: 0,
        stepId: "identity",
        data: {},
      }).success,
    ).toBe(false);
    expect(
      draftPayloadSchema.safeParse({
        payloadVersion: 1.5,
        stepId: "identity",
        data: {},
      }).success,
    ).toBe(false);
  });

  it("builds an empty payload that satisfies the schema", () => {
    const empty = emptyDraftPayload("photos");
    expect(empty).toEqual({
      payloadVersion: 1,
      stepId: "photos",
      data: {},
    });
    expect(draftPayloadSchema.safeParse(empty).success).toBe(true);
  });
});
