// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Rental } from "@/mastra/tools/search-rentals";
import type { RentalAskResults } from "@/components/rentals/rental-ask-composer";
import {
  askFilterSignature,
  clearStoredAskResults,
  readStoredAskResults,
  writeStoredAskResults,
} from "@/lib/rentals/ask-results-storage";

const payload = {
  results: [{
    id: "rnt_1", title: "Calle 10", neighborhood: "Laureles",
    nightly_price: 80_000, currency: "COP", bedrooms: 2, wifi: true, amenities: [],
    image: "", source_url: "https://example.com/rentals/1", can_schedule_viewing: false,
    schedule_viewing_url: null, host_name: "Host", availability: "unknown", tags: [],
  }] as Rental[],
  total: 1,
  query: "Show furnished 2-bedroom apartments in Laureles.",
  unappliedRequests: ["furnished"],
} satisfies RentalAskResults;

const signature = askFilterSignature({ neighborhood: "Laureles", beds: "2" });

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("ask results storage", () => {
  it("restores the cards for the same thread and filters", () => {
    writeStoredAskResults("thread-1", signature, payload);
    expect(readStoredAskResults("thread-1", signature)).toEqual(payload);
  });

  it("does not restore across a different thread or filter change", () => {
    writeStoredAskResults("thread-1", signature, payload);
    expect(readStoredAskResults("thread-2", signature)).toBeNull();
    expect(
      readStoredAskResults("thread-1", askFilterSignature({ neighborhood: "Envigado" })),
    ).toBeNull();
  });

  it("rejects invalid or corrupted cached rental rows and totals", () => {
    writeStoredAskResults("thread-1", signature, payload);
    const key = "mde:rental-ask-results:v1:thread-1";
    const valid = JSON.parse(window.sessionStorage.getItem(key)!);
    valid.payload.results[0].nightly_price = "not a price";
    window.sessionStorage.setItem(key, JSON.stringify(valid));
    expect(readStoredAskResults("thread-1", signature)).toBeNull();

    valid.payload.results[0].nightly_price = 80_000;
    valid.payload.total = -1;
    window.sessionStorage.setItem(key, JSON.stringify(valid));
    expect(readStoredAskResults("thread-1", signature)).toBeNull();
  });

  it("ignores malformed or missing values", () => {
    window.sessionStorage.setItem("mde:rental-ask-results:v1:thread-1", "{not json");
    expect(readStoredAskResults("thread-1", signature)).toBeNull();
    expect(readStoredAskResults(undefined, signature)).toBeNull();
    expect(readStoredAskResults("thread-1", signature)).toBeNull();
  });

  it("clears on a new search or Clear", () => {
    writeStoredAskResults("thread-1", signature, payload);
    clearStoredAskResults("thread-1");
    expect(readStoredAskResults("thread-1", signature)).toBeNull();
  });
});
