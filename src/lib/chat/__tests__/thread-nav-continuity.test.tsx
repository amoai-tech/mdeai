// @vitest-environment jsdom
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: null as string | null, loading: false }));
vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({
    user: auth.id ? { id: auth.id } : null,
    loading: auth.loading,
  }),
}));
import { ThreadNavProvider, useThreadNav } from "../thread-nav-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let nav: ReturnType<typeof useThreadNav>;
function Probe() {
  const value = useThreadNav();
  useEffect(() => { nav = value; });
  return <span data-testid="thread">{value.sessionThreadId}</span>;
}
async function show(key = "root") {
  await act(async () => { root.render(<ThreadNavProvider key={key}><Probe /></ThreadNavProvider>); });
}
const change = (fn: () => void) => act(async () => fn());
const saved = () => JSON.parse(window.sessionStorage.getItem("mde:thread-selection:v1") || "{}");

beforeEach(() => {
  auth.id = null;
  auth.loading = false;
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/chat");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("SAN-1413 · per-tab thread ownership", () => {
  it("keeps the ID after a root remount (refresh), and makes a new ID on New Chat", async () => {
    await show();
    const original = nav.sessionThreadId;
    expect(original).toMatch(/^[a-f0-9-]{36}$/);
    await show("new-root");
    expect(nav.sessionThreadId).toBe(original);
    await change(() => nav.clearActiveThread());
    expect(nav.sessionThreadId).not.toBe(original);
    expect(saved().sessionThreadId).toBe(nav.sessionThreadId);
    await show("again");
    expect(nav.sessionThreadId).toBe(saved().sessionThreadId);
  });

  it("a separate ordinary tab has its own fresh ID", async () => {
    await show();
    const original = nav.sessionThreadId;
    // A separate browser tab starts with separate sessionStorage, not the old tab's values.
    window.sessionStorage.clear();
    await show("other-tab");
    expect(nav.sessionThreadId).not.toBe(original);
  });

  it("keeps saved selection after refresh, and Back/Forward restores A and B", async () => {
    await show();
    const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await change(() => nav.selectSavedThread(A));
    const stateA = window.history.state;
    await change(() => nav.selectSavedThread(B));
    const stateB = window.history.state;
    expect(nav.activeThreadId).toBe(B);
    expect(saved().activeThreadId).toBe(B);

    let cleared = 0;
    const onReset = () => { cleared += 1; };
    window.addEventListener("mde:chat-history-selection", onReset);
    window.history.replaceState(stateA, "", "/chat");
    await change(() => window.dispatchEvent(new PopStateEvent("popstate", { state: stateA })));
    expect(nav.activeThreadId).toBe(A);
    expect(cleared).toBe(1);
    window.history.replaceState(stateB, "", "/chat");
    await change(() => window.dispatchEvent(new PopStateEvent("popstate", { state: stateB })));
    expect(nav.activeThreadId).toBe(B);
    expect(cleared).toBe(2);
    window.removeEventListener("mde:chat-history-selection", onReset);
    await show("reload");
    expect(nav.activeThreadId).toBe(B);
    expect(window.location.search).toBe("");
  });

  it("auth-loading does not expose a previous user's selected saved chat", async () => {
    auth.id = "sofia";
    await show();
    const savedA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await change(() => nav.selectSavedThread(savedA));
    const oldId = nav.sessionThreadId;
    auth.loading = true;
    await show();
    expect(container.querySelector('[data-testid="thread"]')).toBeNull();
    auth.loading = false;
    auth.id = "camila";
    await show();
    expect(nav.activeThreadId).toBeUndefined();
    expect(nav.sessionThreadId).not.toBe(oldId);
    expect(saved().owner).toBe("camila");
  });

  it("does not replay a never-sent UUID and tracks a successfully saved one", async () => {
    auth.id = "sofia";
    await show();
    const original = nav.sessionThreadId!;
    expect(nav.hasPersistedThread).toBe(false);
    await change(() => nav.markThreadSaved(original));
    expect(nav.hasPersistedThread).toBe(true);
    await show("return");
    expect(nav.hasPersistedThread).toBe(true);
    await change(() => nav.clearActiveThread());
    expect(nav.hasPersistedThread).toBe(false);
  });

  it("does not claim anonymous chats are durably saved or owner-readable", async () => {
    await show();
    await change(() => nav.markThreadSaved(nav.sessionThreadId!));
    expect(nav.hasPersistedThread).toBe(false);
  });

  it("uses in-memory continuity when session storage is blocked", async () => {
    await show();
    const original = nav.sessionThreadId;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    await change(() => nav.selectSavedThread("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"));
    expect(nav.sessionThreadId).toBe(original);
    spy.mockRestore();
  });
});
