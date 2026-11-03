import { describe, it, expect, vi } from "vitest";
import { selectHostThread } from "../host-thread-id";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const uuid = vi.fn(() => A);
const makeStore = () => {
  const data = new Map<string,string>();
  return {
    getItem: (key:string) => data.get(key) ?? null,
    setItem: (key:string,value:string) => { data.set(key,value); },
  };
};
describe("Host Ops thread selection", () => {
  it("reuses the same thread for one authenticated user after a fresh mount", () => {
    const store = makeStore();
    expect(selectHostThread("ana",store,uuid)).toEqual({userId:"ana",threadId:A,restored:false});
    expect(selectHostThread("ana",store,() => B)).toEqual({userId:"ana",threadId:A,restored:true});
  });
  it("isolates different account selections in one browser", () => {
    const store=makeStore();
    selectHostThread("ana",store,() => A);
    expect(selectHostThread("carlos",store,() => B).threadId).toBe(B);
    expect(selectHostThread("ana",store,() => B).threadId).toBe(A);
  });
  it("rejects malformed cached ids", () => {
    const store=makeStore();
    store.setItem("mde:host-ops:thread:v1:ana","victim-thread");
    expect(selectHostThread("ana",store,() => B)).toEqual({userId:"ana",threadId:B,restored:false});
  });
  it("falls back when the browser sessionStorage getter itself throws", () => {
    const getStorage = vi.fn((): Pick<Storage, "getItem" | "setItem"> => {
      throw new DOMException("Storage blocked by browser policy", "SecurityError");
    });
    expect(selectHostThread("ana",getStorage,() => A)).toEqual({
      userId:"ana",threadId:A,restored:false,
    });
    expect(getStorage).toHaveBeenCalledOnce();
  });
  it("continues without persistence if browser storage is denied", () => {
    const store={getItem:()=>{throw new Error("disabled")},setItem:()=>{throw new Error("disabled")}};
    expect(selectHostThread("ana",store,() => A)).toEqual({userId:"ana",threadId:A,restored:false});
  });
});
