// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { RentalAskResults } from "@/components/rentals/rental-ask-composer";
import { useRentalAskResults } from "@/components/rentals/use-rental-ask-results";
import {
  askFilterSignature,
  readStoredAskResults,
} from "@/lib/rentals/ask-results-storage";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const a = askFilterSignature({ neighborhood: "Laureles", beds: "2" });
const b = askFilterSignature({ neighborhood: "Envigado", beds: "2" });
const result = {
  query: "2 bedrooms in Laureles under COP 3 million",
  results: [{
    id: "rental-laureles", title: "Laureles", neighborhood: "Laureles",
    nightly_price: 80_000, currency: "COP", bedrooms: 2, wifi: true, amenities: [],
    image: "", source_url: "https://example.com/rentals/1", can_schedule_viewing: false,
    schedule_viewing_url: null, host_name: "Host", availability: "unknown", tags: [],
  }],
  total: 1,
} as RentalAskResults;

function Harness({ thread, signature }: { thread: string; signature: string }) {
  const { activeAsk, acceptResults, clearResults } = useRentalAskResults(thread, signature);
  return (
    <>
      <p data-testid="shown">{activeAsk?.query ?? "catalogue"}</p>
      <button id="ask" onClick={() => acceptResults(result)}>Search</button>
      <button id="clear" onClick={clearResults}>Clear</button>
    </>
  );
}

describe("Rental Ask MDE storage scoping", () => {
  let node: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
    window.sessionStorage.clear();
  });

  async function draw(thread: string, signature: string) {
    await act(async () => root.render(<Harness thread={thread} signature={signature} />));
  }
  async function click(id: string) {
    await act(async () => node.querySelector<HTMLButtonElement>(`#${id}`)!.click());
  }
  function displayed() {
    return node.querySelector('[data-testid="shown"]')?.textContent;
  }

  it("saves new results once and restores them after remount", async () => {
    await draw("thread-1", a);
    expect(displayed()).toBe("catalogue");
    await click("ask");
    expect(displayed()).toBe(result.query);
    expect(readStoredAskResults("thread-1", a)).toEqual(result);
    await draw("thread-1", a);
    expect(displayed()).toBe(result.query);
  });

  it("does not re-sign or display old results when URL filters change", async () => {
    await draw("thread-1", a);
    await click("ask");
    await draw("thread-1", b);
    expect(displayed()).toBe("catalogue");
    expect(readStoredAskResults("thread-1", b)).toBeNull();
    expect(readStoredAskResults("thread-1", a)).toEqual(result);
    // Rerenders with changed props must never persist a result again.
    await draw("thread-1", b);
    expect(readStoredAskResults("thread-1", b)).toBeNull();
  });

  it("isolates saved threads even without remounting the browse component", async () => {
    await draw("thread-1", a);
    await click("ask");
    await draw("thread-2", a);
    expect(displayed()).toBe("catalogue");
    expect(readStoredAskResults("thread-2", a)).toBeNull();
    await click("clear");
    expect(readStoredAskResults("thread-1", a)).toEqual(result);
    await draw("thread-1", a);
    expect(displayed()).toBe(result.query);
  });

  it("does not restore cleared results", async () => {
    await draw("thread-1", a);
    await click("ask");
    await click("clear");
    expect(displayed()).toBe("catalogue");
    expect(readStoredAskResults("thread-1", a)).toBeNull();
    await draw("thread-1", a);
    expect(displayed()).toBe("catalogue");
  });
});
