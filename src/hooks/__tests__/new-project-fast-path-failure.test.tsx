// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import React, { useEffect } from "react";

const effects = vi.hoisted(() => ({
  setToolResult: vi.fn(),
  clearOthers: vi.fn(),
  showExchange: vi.fn(),
}));
vi.mock("@/components/chat/new-project-fast-path-context", () => ({
  useNewProjectFastPath: () => ({ setToolResult: effects.setToolResult }),
}));
vi.mock("@/components/chat/event-local-chat-context", () => ({
  useEventLocalChat: () => ({ showExchange: effects.showExchange }),
}));
vi.mock("@/hooks/use-clear-other-fast-path-results", () => ({
  useClearOtherFastPathResults: () => effects.clearOthers,
}));

import { useNewProjectSearchFastPath } from "@/hooks/use-new-project-search-fast-path";

const success = {
  results: [{
    slug: "cittadel", name: "Cittadel", neighborhood: "Laureles", sourceOwner: null,
    priceLabel: "Not published", priceKnown: false, bedroomsLabel: "2 bedrooms",
    deliveryLabel: "Delivery date not published", statusLabel: null, visLabel: null,
    unitTypeCount: 5, verifiedLabel: "Not yet verified",
    detailUrl: "/new-projects/cittadel", primarySourceUrl: null,
    primarySourceCheckedLabel: null, unknownFields: ["price"],
  }],
  totalPublished: 16, returned: 1, note: "",
};
const query = "show me new condos in Laureles";
let send: (text: string) => Promise<boolean>;
let root: Root;
let el: HTMLDivElement;

function Harness() {
  const { handleUserMessage } = useNewProjectSearchFastPath();
  useEffect(() => { send = handleUserMessage; }, [handleUserMessage]);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root.render(React.createElement(Harness)));
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

describe("New Projects fast-path real failure handling", () => {
  it.each([400, 500])("shows an honest message on HTTP %i, clears stale cards, and prevents duplicate agent retry", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {status})));
    let handled: boolean | undefined;
    await act(async () => { handled = await send(query); });
    expect(handled).toBe(true);
    expect(effects.clearOthers).toHaveBeenCalledWith("new_project");
    expect(effects.setToolResult).toHaveBeenCalledWith(null);
    expect(effects.showExchange).toHaveBeenCalledWith(query, expect.stringContaining("couldn't search"));
  });

  it("handles a failed network request visibly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));
    await act(async () => { expect(await send(query)).toBe(true); });
    expect(effects.showExchange).toHaveBeenCalledWith(query, expect.stringContaining("Please try again"));
  });

  it("rejects an invalid API envelope without showing stale results or calling the agent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({results: []}), {status:200})));
    await act(async () => { expect(await send(query)).toBe(true); });
    expect(effects.setToolResult).toHaveBeenLastCalledWith(null);
    expect(effects.showExchange).toHaveBeenCalledWith(query, expect.stringContaining("couldn't search"));
  });

  it("reports invalid buyer filters without broadening the search", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await act(async () => {
      expect(await send("new projects under 1,23,4 million")).toBe(true);
      expect(await send("new 10 bedroom projects")).toBe(true);
      expect(await send("new projects in Envigado")).toBe(true);
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(effects.showExchange).toHaveBeenCalledWith(
      "new projects under 1,23,4 million", expect.stringContaining("couldn't interpret"),
    );
    expect(effects.showExchange).toHaveBeenCalledWith(
      "new 10 bedroom projects", expect.stringContaining("1 to 6 bedrooms"),
    );
    expect(effects.showExchange).toHaveBeenCalledWith(
      "new projects in Envigado", expect.stringContaining("currently covers Laureles"),
    );
  });

  it("latest request wins, suppresses superseded reply, and never calls an agent", async () => {
    let resolveOld!: (response: Response) => void;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify(success), {status:200}));
    vi.stubGlobal("fetch", fetcher);
    let old!: Promise<boolean>;
    let newer!: Promise<boolean>;
    await act(async () => {
      old = send("show me new condos in Laureles");
      newer = send("show me new condos in El Poblado");
      expect(await newer).toBe(true);
      resolveOld(new Response(JSON.stringify(success), {status:200}));
      expect(await old).toBe(true);
    });
    expect(effects.showExchange).toHaveBeenCalledTimes(1);
    expect(effects.showExchange).toHaveBeenCalledWith(
      "show me new condos in El Poblado", "Found 1 new project.",
    );
    expect(effects.setToolResult).toHaveBeenLastCalledWith(success);
  });
});
