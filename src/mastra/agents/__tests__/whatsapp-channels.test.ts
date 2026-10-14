import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createWhatsAppAdapter: vi.fn() }));

vi.mock("@chat-adapter/whatsapp", () => ({
  createWhatsAppAdapter: mocks.createWhatsAppAdapter,
}));

import { flushBufferedReply, runWithOutboundTracking } from "@/lib/whatsapp/outbound-tracker";
import { buildConciergeChannels } from "../whatsapp-channels";

function configure(): void {
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token");
  vi.stubEnv("WHATSAPP_APP_SECRET", "secret");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildConciergeChannels", () => {
  it("constructs nothing when the channel is unconfigured", () => {
    expect(buildConciergeChannels()).toBeUndefined();
    expect(mocks.createWhatsAppAdapter).not.toHaveBeenCalled();
  });

  it("returns the adapter config when it builds", () => {
    configure();
    const adapter = { name: "whatsapp", postMessage: vi.fn() };
    mocks.createWhatsAppAdapter.mockReturnValue(adapter);
    const channels = buildConciergeChannels();
    // WhatsApp gets ONE consolidated reply: no streamed progress notifications, no tool cards.
    expect(channels).toEqual({
      adapters: { whatsapp: { adapter, streaming: false, toolDisplay: "hidden" } },
    });
    expect(typeof channels?.adapters.whatsapp.adapter.postMessage).toBe("function");
  });

  it("buffers a whole run and sends exactly one reply", async () => {
    configure();
    const postMessage = vi.fn<(threadId: string, message: unknown) => Promise<{ id: string }>>(
      async () => ({ id: "wamid.sent" }),
    );
    mocks.createWhatsAppAdapter.mockReturnValue({ postMessage });
    const channels = buildConciergeChannels();
    const wrapped = channels!.adapters.whatsapp.adapter as unknown as {
      postMessage: (threadId: string, message: unknown) => Promise<unknown>;
    };

    await runWithOutboundTracking(async () => {
      await wrapped.postMessage("thread", "I'll check those apartments");
      await wrapped.postMessage("thread", "Found 3: A COP 2.9M, B COP 3.2M, C COP 3.4M");
      // Nothing physical yet: the run has buffered both pieces.
      expect(postMessage).not.toHaveBeenCalled();
      // The single flush happens INSIDE the scope.
      expect(await flushBufferedReply()).toBe("wamid.sent");
    });
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith("thread", "Found 3: A COP 2.9M, B COP 3.2M, C COP 3.4M");
  });

  it("routes concurrent runs through their own adapter, never another sender", async () => {
    configure();
    // attachWholeRunBuffer replaces adapter.postMessage, so keep the original spies.
    const sendA = vi.fn(async () => ({ id: "wamid.A" }));
    const sendB = vi.fn(async () => ({ id: "wamid.B" }));
    mocks.createWhatsAppAdapter
      .mockReturnValueOnce({ postMessage: sendA })
      .mockReturnValueOnce({ postMessage: sendB });
    const wrapAdapter = (adapter: unknown) =>
      adapter as { postMessage: (threadId: string, message: unknown) => Promise<unknown> };
    const channelsA = buildConciergeChannels();
    const channelsB = buildConciergeChannels();

    await Promise.all([
      runWithOutboundTracking(async () => {
        await wrapAdapter(channelsA!.adapters.whatsapp.adapter).postMessage("tA", "reply A");
        await flushBufferedReply();
      }),
      runWithOutboundTracking(async () => {
        await wrapAdapter(channelsB!.adapters.whatsapp.adapter).postMessage("tB", "reply B");
        await flushBufferedReply();
      }),
    ]);

    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendA).toHaveBeenCalledWith("tA", "reply A");
    expect(sendB).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledWith("tB", "reply B");
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
