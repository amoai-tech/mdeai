// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "@/hooks/use-session";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.subscribe,
    },
  }),
}));

const alice = { id: "alice" } as User;
const bob = { id: "bob" } as User;
type UserResponse = { data: { user: User | null }; error: null };
function deferred() {
  let resolve!: (value: UserResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<UserResponse>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let emit: (event: string, session: Session | null) => void;
const event = (kind: string, user: User | null) => {
  act(() => emit(kind, user ? ({ user } as Session) : null));
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscribe.mockImplementation((cb: typeof emit) => {
    emit = cb;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});

describe("useSession initial lookup vs. auth events", () => {
  it("keeps a newer SIGNED_IN user when the old initial lookup completes anonymous", async () => {
    const pending = deferred();
    mocks.getUser.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSession());
    expect(result.current.loading).toBe(true);
    event("SIGNED_IN", alice);
    expect(result.current).toMatchObject({ user: alice, loading: false });
    await act(async () => pending.resolve({ data: { user: null }, error: null }));
    expect(result.current).toMatchObject({ user: alice, loading: false });
  });

  it("keeps SIGNED_OUT after an old initial lookup returns a signed-in user", async () => {
    const pending = deferred();
    mocks.getUser.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSession());
    event("SIGNED_OUT", null);
    await act(async () => pending.resolve({ data: { user: alice }, error: null }));
    expect(result.current).toMatchObject({ user: null, loading: false });
  });

  it("clears loading and leaves guest actions available if getUser rejects", async () => {
    const pending = deferred();
    mocks.getUser.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSession());
    await act(async () => pending.reject(new Error("network unavailable")));
    expect(result.current).toMatchObject({ user: null, loading: false });
  });

  it("resolves the initial user when no newer auth event occurred", async () => {
    const pending = deferred();
    mocks.getUser.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useSession());
    event("INITIAL_SESSION", null);
    await act(async () => pending.resolve({ data: { user: bob }, error: null }));
    expect(result.current).toMatchObject({ user: bob, loading: false });
  });

  it("ignores late responses after unmount and cleans up the subscription", async () => {
    const pending = deferred();
    mocks.getUser.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useSession());
    unmount();
    await act(async () => pending.resolve({ data: { user: bob }, error: null }));
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});
