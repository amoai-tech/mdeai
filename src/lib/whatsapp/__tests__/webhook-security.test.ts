import { describe, expect, it } from "vitest";
import {
  extractInboundEvents,
  mergeDeliveryStatus,
  resolveVerificationChallenge,
  verifyMetaSignature,
} from "../webhook-security";
import { signMetaBody, TEST_APP_SECRET } from "./test-signing";

describe("verifyMetaSignature", () => {
  it("accepts a correctly signed raw body", () => {
    const body = JSON.stringify({ hello: "wörld é" });
    expect(verifyMetaSignature(body, signMetaBody(body), TEST_APP_SECRET)).toBe(true);
  });

  it("rejects forged secrets, missing headers, wrong algorithms and length mismatches", () => {
    const body = "{}";
    expect(verifyMetaSignature(body, signMetaBody(body, "other-secret"), TEST_APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, null, TEST_APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "md5=" + signMetaBody(body).slice(5), TEST_APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=deadbeef", TEST_APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=", TEST_APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, signMetaBody(body), "")).toBe(false);
  });

  it("fails when a byte changes after signing (raw-body requirement)", () => {
    const body = JSON.stringify({ text: "café" });
    const signature = signMetaBody(body);
    expect(verifyMetaSignature(body + " ", signature, TEST_APP_SECRET)).toBe(false);
    expect(verifyMetaSignature(body, signature, TEST_APP_SECRET)).toBe(true);
  });
});

describe("resolveVerificationChallenge", () => {
  const url = (qs: string) => new URL("https://x.test/api/whatsapp/webhook?" + qs);
  it("echoes the challenge only for subscribe + matching token", () => {
    expect(resolveVerificationChallenge(url("hub.mode=subscribe&hub.verify_token=vt&hub.challenge=abc"), "vt")).toBe("abc");
    expect(resolveVerificationChallenge(url("hub.mode=subscribe&hub.verify_token=no&hub.challenge=abc"), "vt")).toBeNull();
    expect(resolveVerificationChallenge(url("hub.mode=unsubscribe&hub.verify_token=vt&hub.challenge=abc"), "vt")).toBeNull();
    expect(resolveVerificationChallenge(url("hub.mode=subscribe&hub.verify_token=vt"), "vt")).toBeNull();
  });
});

describe("extractInboundEvents", () => {
  it("ignores unknown envelopes and unknown fields", () => {
    expect(extractInboundEvents(null)).toEqual([]);
    expect(extractInboundEvents({ object: "page" })).toEqual([]);
    expect(extractInboundEvents({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "account_update" }] }] })).toEqual([]);
  });

  it("extracts message and status events with their provider ids", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{ id: "W", changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "123" },
        messages: [{ id: "wamid.IN", from: "57" }],
        statuses: [{ id: "wamid.OUT", status: "delivered" }],
      } }] }],
    };
    expect(extractInboundEvents(payload)).toEqual([
      { kind: "message", providerEventId: "wamid.IN", phoneNumberId: "123", from: "57", status: null },
      { kind: "status", providerEventId: "wamid.OUT", phoneNumberId: "123", from: null, status: "delivered" },
    ]);
  });
});

describe("mergeDeliveryStatus", () => {
  it("is monotonic and never regresses", () => {
    expect(mergeDeliveryStatus("pending", "sent")).toBe("sent");
    expect(mergeDeliveryStatus("read", "delivered")).toBe("read");
    expect(mergeDeliveryStatus("sent", "sent")).toBe("sent");
    expect(mergeDeliveryStatus(null, "delivered")).toBe("delivered");
    expect(mergeDeliveryStatus("delivered", null)).toBe("delivered");
    expect(mergeDeliveryStatus("read", "failed")).toBe("failed");
    expect(mergeDeliveryStatus("failed", "read")).toBe("failed");
    expect(mergeDeliveryStatus("sent", "unknown-status")).toBe("sent");
  });
});
