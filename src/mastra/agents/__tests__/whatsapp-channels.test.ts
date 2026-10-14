import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createWhatsAppAdapter: vi.fn() }));

vi.mock("@chat-adapter/whatsapp", () => ({
  createWhatsAppAdapter: mocks.createWhatsAppAdapter,
}));

import { buildConciergeChannels } from "../whatsapp-channels";

function configure(): void {
  process.env.WHATSAPP_ACCESS_TOKEN = "token";
  process.env.WHATSAPP_APP_SECRET = "secret";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
  process.env.WHATSAPP_VERIFY_TOKEN = "verify";
}

function clearEnv(): void {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearEnv();
});
afterEach(clearEnv);

describe("buildConciergeChannels", () => {
  it("constructs nothing when the channel is unconfigured", () => {
    expect(buildConciergeChannels()).toBeUndefined();
    expect(mocks.createWhatsAppAdapter).not.toHaveBeenCalled();
  });

  it("returns the adapter config when it builds", () => {
    configure();
    const adapter = { name: "whatsapp" };
    mocks.createWhatsAppAdapter.mockReturnValue(adapter);
    expect(buildConciergeChannels()).toEqual({ adapters: { whatsapp: adapter } });
  });

  it("disables the channel on a configuration (ValidationError)", () => {
    configure();
    const error = new Error("invalid credentials");
    error.name = "ValidationError";
    mocks.createWhatsAppAdapter.mockImplementation(() => {
      throw error;
    });
    expect(buildConciergeChannels()).toBeUndefined();
  });

  it("re-throws an unexpected error instead of hiding it", () => {
    configure();
    mocks.createWhatsAppAdapter.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => buildConciergeChannels()).toThrow("boom");
  });
});
