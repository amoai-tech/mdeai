import { describe, expect, it } from "vitest";
import { externalSourceAttribution } from "@/lib/rentals/provenance";

describe("externalSourceAttribution — attribution is not requestability (SAN-1235)", () => {
  it("keeps the genuine advertiser for an MDE-managed import", () => {
    expect(
      externalSourceAttribution({
        mde_managed_development: true,
        source_record_type: "third_party_advertisement",
        source_provider: "Fincaraíz",
        source_original_url: "https://www.fincaraiz.com.co/x/1",
      }),
    ).toEqual({ provider: "Fincaraíz", originalUrl: "https://www.fincaraiz.com.co/x/1" });
  });

  it("falls back to the import's source_url when no original_url was preserved", () => {
    expect(
      externalSourceAttribution({
        mde_managed_development: true,
        source_provider: "Rentberry",
        source_url: "https://rentberry.com/listing/9",
      }),
    ).toEqual({ provider: "Rentberry", originalUrl: "https://rentberry.com/listing/9" });
  });

  it("returns nothing rather than inferring a source", () => {
    expect(externalSourceAttribution({})).toEqual({ provider: null, originalUrl: null });
    expect(externalSourceAttribution(null)).toEqual({ provider: null, originalUrl: null });
    expect(externalSourceAttribution("nope")).toEqual({ provider: null, originalUrl: null });
    // A declared type with no recorded values must not invent them.
    expect(
      externalSourceAttribution({ source_record_type: "third_party_advertisement" }),
    ).toEqual({ provider: null, originalUrl: null });
  });

  it("never turns a blank or whitespace value into a source", () => {
    expect(
      externalSourceAttribution({ source_provider: "   ", source_original_url: "" }),
    ).toEqual({ provider: null, originalUrl: null });
  });
});
