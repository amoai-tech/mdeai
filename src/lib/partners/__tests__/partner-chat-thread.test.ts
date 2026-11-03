import { describe, expect, it } from "vitest";
import { getPartnerChatThreadId } from "../partner-chat-thread";

const USER_A = "6b51e65f-f7b1-4ad7-9185-f2ecae22eb00";
const USER_B = "92361f88-f24f-4cb8-8025-05ec6c17bb44";
const CAFE_A = "6a9167cc-7cb6-4837-a7e0-2039654f138c";
const CAFE_B = "17243544-7b84-4f74-b631-f3a44c193e40";
const THREAD_A = "82871ea3-874f-49f5-83ee-485643817bb4";
const THREAD_B = "1af94565-825b-4ca9-99d8-0b572be6b225";

function session() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("SAN-705 partner-specific CopilotKit chat threads", () => {
  it("reuses a thread only for the same user and business", () => {
    const store = session();
    expect(getPartnerChatThreadId(store, USER_A, CAFE_A, () => THREAD_A)).toBe(THREAD_A);
    expect(getPartnerChatThreadId(store, USER_A, CAFE_A, () => THREAD_B)).toBe(THREAD_A);
  });

  it("separates two partner businesses and their previous chat history", () => {
    const store = session();
    expect(getPartnerChatThreadId(store, USER_A, CAFE_A, () => THREAD_A)).toBe(THREAD_A);
    expect(getPartnerChatThreadId(store, USER_A, CAFE_B, () => THREAD_B)).toBe(THREAD_B);
    expect(getPartnerChatThreadId(store, USER_A, CAFE_A, () => THREAD_B)).toBe(THREAD_A);
  });

  it("separates users on the same shared browser", () => {
    const store = session();
    getPartnerChatThreadId(store, USER_A, CAFE_A, () => THREAD_A);
    expect(getPartnerChatThreadId(store, USER_B, CAFE_A, () => THREAD_B)).toBe(THREAD_B);
  });

  it("discards malformed stored IDs instead of replaying them", () => {
    const store = session();
    store.setItem(`mde:partner-chat-thread:v1:${USER_A}:${CAFE_A}`, "wrong-id");
    expect(getPartnerChatThreadId(store, USER_A, CAFE_A, () => THREAD_B)).toBe(THREAD_B);
  });

  it("still opens a private temporary thread when storage is denied", () => {
    const store = {
      getItem: () => { throw new Error("storage blocked"); },
      setItem: () => { throw new Error("storage blocked"); },
    };
    expect(getPartnerChatThreadId(store, USER_A, CAFE_A, () => THREAD_A)).toBe(THREAD_A);
  });
});
