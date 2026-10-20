// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentalInlineAsk } from "@/components/rentals/rental-inline-ask";
import type { Rental } from "@/mastra/tools/search-rentals";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RENTAL = {
  id: "rnt_lau_001",
  title: "Bright 2BR in Laureles",
  neighborhood: "Laureles",
  bedrooms: 2,
  nightly_price: 70,
  price_monthly: 2400000,
  currency: "COP",
  amenities: [],
  photos: [],
} as unknown as Rental;

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function input() {
  return container.querySelector<HTMLInputElement>('[data-testid="rental-inline-ask-input"]')!;
}

function submit() {
  container.querySelector<HTMLButtonElement>('[data-testid="rental-inline-ask-submit"]')!.click();
}

describe("RentalInlineAsk — SAN-1421 inline Ask MDE", () => {
  it("turns a question into the same rental search the chat fast path uses", async () => {
    const onResults = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [RENTAL], total: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    act(() => root!.render(<RentalInlineAsk activeQuery={null} onClear={vi.fn()} onResults={onResults} />));
    type(input(), "Find furnished 2-bedroom apartments in Laureles under COP 3 million");
    await flush();
    act(() => submit());
    await flush();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/rentals/search");
    const body = JSON.parse(String(init.body));
    expect(body.neighborhood).toBe("Laureles");
    expect(body.minBedrooms).toBe(2);
    expect(body.limit).toBe(20);
    // The shared parser still cannot apply "COP 3 million" as a monthly cap (SAN-386 owns that
    // contract). The answer must say so rather than imply the budget was honoured.
    expect(body.maxPriceMonthly).toBeUndefined();
    expect(onResults).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 1,
        query: "Find furnished 2-bedroom apartments in Laureles under COP 3 million",
        budgetNotice: expect.stringContaining("could not apply a monthly budget"),
      }),
    );
  });

  it("keeps a failed search visible with a retry instead of blanking the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "rental_search_unavailable" }), { status: 503 })),
    );
    act(() => root!.render(<RentalInlineAsk activeQuery={null} onClear={vi.fn()} onResults={vi.fn()} />));
    type(input(), "Apartments in Laureles");
    await flush();
    act(() => submit());
    await flush();
    await flush();

    const alert = container.querySelector('[data-testid="rental-inline-ask-error"]');
    expect(alert?.textContent).toContain("temporarily unavailable");
    expect(container.querySelector('[data-testid="rental-inline-ask-summary"]')).toBeNull();
  });

  it("runs an example chip without the renter typing anything", async () => {
    const onResults = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [RENTAL], total: 1 }), { status: 200 })),
    );
    act(() => root!.render(<RentalInlineAsk activeQuery={null} onClear={vi.fn()} onResults={onResults} />));
    const chip = container.querySelector<HTMLButtonElement>('[data-testid="rental-inline-ask-example"]')!;
    act(() => chip.click());
    await flush();
    await flush();
    expect(onResults).toHaveBeenCalledTimes(1);
  });

  it("offers a clear action while an answer is displayed", () => {
    const onClear = vi.fn();
    act(() =>
      root!.render(
        <RentalInlineAsk activeQuery="Apartments in Laureles" onClear={onClear} onResults={vi.fn()} />,
      ),
    );
    const summary = container.querySelector('[data-testid="rental-inline-ask-summary"]');
    expect(summary?.textContent).toContain("Apartments in Laureles");
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="rental-inline-ask-clear"]')!.click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
