import { describe, expect, it } from "vitest";
import { isWhatsAppChannelConfigured, readWhatsAppChannelEnv } from "../channel-env";

const full = {
  WHATSAPP_ACCESS_TOKEN: "token",
  WHATSAPP_APP_SECRET: "secret",
  WHATSAPP_PHONE_NUMBER_ID: "123456",
  WHATSAPP_VERIFY_TOKEN: "verify",
};

describe("readWhatsAppChannelEnv", () => {
  it("returns null unless every required value is present and non-blank", () => {
    expect(readWhatsAppChannelEnv({})).toBeNull();
    for (const key of Object.keys(full)) {
      expect(readWhatsAppChannelEnv({ ...full, [key]: "" })).toBeNull();
      expect(readWhatsAppChannelEnv({ ...full, [key]: "   " })).toBeNull();
    }
  });

  it("returns trimmed config when complete", () => {
    expect(readWhatsAppChannelEnv({ ...full, WHATSAPP_BOT_USERNAME: " mde " })).toEqual({
      accessToken: "token",
      appSecret: "secret",
      phoneNumberId: "123456",
      verifyToken: "verify",
      userName: "mde",
    });
  });

  it("leaves userName undefined when not provided", () => {
    expect(readWhatsAppChannelEnv(full)?.userName).toBeUndefined();
  });

  it("isWhatsAppChannelConfigured mirrors the reader", () => {
    expect(isWhatsAppChannelConfigured(full)).toBe(true);
    expect(isWhatsAppChannelConfigured({})).toBe(false);
  });
});
