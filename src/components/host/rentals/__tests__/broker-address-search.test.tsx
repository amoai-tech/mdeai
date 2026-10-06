// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrokerAddressSearch } from "../broker-address-search";
import type { PlaceSearchResult } from "@/lib/place-search";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RESULT: PlaceSearchResult = {
  placeId: "ChIJabc12345",
  displayName: "Calle 10",
  formattedAddress: "Calle 10 #42-15, Laureles",
  latitude: 6.2447,
  longitude: -75.5916,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function Harness({
  onSelect,
}: {
  onSelect: (result: PlaceSearchResult) => void;
}) {
  const [value, setValue] = React.useState("");
  return (
    <BrokerAddressSearch
      value={value}
      onTextChange={setValue}
      onSelect={onSelect}
      onClearSelection={() => {}}
    />
  );
}

let container: HTMLDivElement;
let root: Root;

function inputEl(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("#ro-address")!;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function typeAndSettle(input: HTMLInputElement, value: string) {
  await act(async () => {
    setInputValue(input, value);
  });
  await act(async () => {
    vi.advanceTimersByTime(400);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BrokerAddressSearch", () => {
  it("selects an address with the mouse and shows the normalized address", async () => {
    const onSelect = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ results: [RESULT] })),
    );
    await act(async () => {
      root.render(<Harness onSelect={onSelect} />);
    });
    const input = inputEl();
    await typeAndSettle(input, "calle 10 laureles");

    const option = container.querySelector<HTMLElement>('[data-testid="ro-address-option"]')!;
    expect(option).toBeTruthy();
    await act(async () => {
      option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith(RESULT);
    expect(input.value).toBe("Calle 10 #42-15, Laureles");
  });

  it("selects an address with the keyboard (ArrowDown + Enter)", async () => {
    const onSelect = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ results: [RESULT] })),
    );
    await act(async () => {
      root.render(<Harness onSelect={onSelect} />);
    });
    const input = inputEl();
    await typeAndSettle(input, "calle 10 laureles");

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(input.getAttribute("aria-activedescendant")).toBe("ro-address-option-0");

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith(RESULT);
  });

  it("debounces rapid typing into a single request for the final query", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL) => jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(<Harness onSelect={vi.fn()} />);
    });
    const input = inputEl();

    await act(async () => {
      setInputValue(input, "calle 10");
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      setInputValue(input, "calle 10 laureles");
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("calle%2010%20laureles");
  });

  it("aborts the superseded request when a new query replaces it", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal as AbortSignal);
      return Promise.resolve(jsonResponse({ results: [RESULT] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      root.render(<Harness onSelect={vi.fn()} />);
    });
    const input = inputEl();

    await typeAndSettle(input, "calle 10 laureles");
    await typeAndSettle(input, "carrera 70 medellin");

    expect(signals.length).toBe(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it("shows a fallback message when the search fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await act(async () => {
      root.render(<Harness onSelect={vi.fn()} />);
    });
    const input = inputEl();
    await typeAndSettle(input, "calle 10 laureles");

    expect(container.textContent).toContain("Address search is unavailable");
  });
});
