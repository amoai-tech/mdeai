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

  it("New Chat immediately creates a new ID while a fresh tab waits for auth", async () => {
    auth.loading = true;
    await show();
    const original = nav.sessionThreadId;
    expect(nav.ready).toBe(false);
    expect(nav.restoringSavedThread).toBe(false);
    await change(() => nav.clearActiveThread());
    const fresh = nav.sessionThreadId;
    expect(fresh).not.toBe(original);
    expect(nav.newChatCount).toBe(1);
    auth.loading = false;
    await show();
    expect(nav.sessionThreadId).toBe(fresh);
    expect(nav.ready).toBe(true);
  });

  it("New Chat cancels a saved history restore instead of reopening the old chat", async () => {
    auth.id = "sofia";
    await show();
    const oldThread = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await change(() => nav.selectSavedThread(oldThread));
    auth.loading = true;
    await show("pending-saved-restoration");
    expect(nav.restoringSavedThread).toBe(true);
    const pendingId = nav.sessionThreadId;
    await change(() => nav.clearActiveThread());
    const freshId = nav.sessionThreadId;
    expect(freshId).not.toBe(pendingId);
    expect(nav.restoringSavedThread).toBe(false);
    expect(nav.activeThreadId).toBeUndefined();
    expect(nav.newChatCount).toBe(1);
    auth.loading = false;
    // An auth state update re-renders the existing provider; changing its React
    // key here would simulate another page reload and discard in-memory state.
    await show("pending-saved-restoration");
    expect(nav.ready).toBe(true);
    expect(nav.sessionThreadId).toBe(freshId);
    expect(nav.activeThreadId).toBeUndefined();
    expect(saved().activeThreadId).toBeUndefined();
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

  it("keeps the chat shell mounted while auth loads without exposing a previous selection", async () => {
    auth.id = "sofia";
    await show();
    const savedA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await change(() => nav.selectSavedThread(savedA));
    const oldId = nav.sessionThreadId;
    auth.loading = true;
    await show("cold-load");
    // The shell must render before the session resolves. Gating the whole app on
    // auth hid the server-rendered chat and its disabled composer (SAN-407) and
    // delayed the mount marker until auth finished (SAN-966).
    expect(container.querySelector('[data-testid="thread"]')).not.toBeNull();
    // ...while nothing from the previous owner's selection is exposed.
    expect(nav.activeThreadId).toBeUndefined();
    expect(nav.hasPersistedThread).toBe(false);
    expect(nav.restoredThread).toBe(false);
    expect(nav.restoringSavedThread, "a stored selection is what auth must be awaited for").toBe(true);
    expect(nav.sessionThreadId).not.toBe(oldId);
    auth.loading = false;
    auth.id = "camila";
    await show();
    expect(nav.activeThreadId).toBeUndefined();
    expect(nav.restoringSavedThread).toBe(false);
    expect(nav.sessionThreadId).not.toBe(oldId);
    expect(saved().owner).toBe("camila");
  });

  it("a fresh tab can select a chat before the verified session resolves", async () => {
    // Nothing is stored, so there is no conversation to reattach: a slow auth
    // call must not block the rail or the composer.
    auth.id = "sofia";
    auth.loading = true;
    await show();
    expect(nav.restoringSavedThread).toBe(false);
    const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await change(() => nav.selectSavedThread(A));
    expect(nav.activeThreadId, "the selection is shown immediately").toBe(A);
    auth.loading = false;
    await show();
    expect(nav.activeThreadId, "and survives the owner resolution").toBe(A);
    expect(nav.restoringSavedThread).toBe(false);
  });

  it("keeps a stored saved chat while the session is still resolving", async () => {
    auth.id = "sofia";
    await show();
    const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await change(() => nav.selectSavedThread(A));
    auth.loading = true;
    await show("cold-load");
    // The empty pre-auth tab must not overwrite the conversation that is still
    // waiting to be reattached; otherwise a refresh during a slow login loses it.
    expect(saved().activeThreadId).toBe(A);
    expect(nav.activeThreadId).toBeUndefined();
    auth.loading = false;
    await show();
    expect(nav.activeThreadId, "the stored chat is restored once the owner is known").toBe(A);
  });

  it("marks a stored saved conversation restorable after a refresh", async () => {
    auth.id = "sofia";
    await show();
    const id = nav.sessionThreadId!;
    await change(() => nav.markThreadSaved(id));
    expect(nav.hasPersistedThread).toBe(true);
    // A turn saved during this session must not immediately replay itself.
    expect(nav.restoredThread).toBe(false);
    // A refresh/reopen adopts the stored conversation and may replay it.
    await show("reload");
    expect(nav.sessionThreadId).toBe(id);
    expect(nav.hasPersistedThread).toBe(true);
    expect(nav.restoredThread).toBe(true);
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
