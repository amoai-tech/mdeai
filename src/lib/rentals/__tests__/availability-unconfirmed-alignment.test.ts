import { describe, expect, it } from "vitest";
import { isAvailabilityUnconfirmed } from "@/lib/rentals/provenance";

/**
 * SAN-486/SAN-1235 — the search filter (availability-filter.ts) and the display helper must agree.
 * Every marker the filter treats as "not confirmed" must produce the "Availability unconfirmed"
 * label, otherwise a listing excluded from confirmed matches could be shown as confirmed.
 */
describe("isAvailabilityUnconfirmed matches the search filter's markers", () => {
  it.each([
    ["simulated test date", { test_available_from_simulated: true }],
    ["simulated test date (string)", { test_available_from_simulated: "true" }],
    ["availability_status unconfirmed", { availability_status: "unconfirmed" }],
    ["availability_status source_claim_unverified", { availability_status: "source_claim_unverified" }],
    ["basis dates unconfirmed", { available_from_basis: "source_for_rent_dates_unconfirmed" }],
    ["basis rented-until past", { available_from_basis: "source_rented_until_past_recheck" }],
    ["basis available-now", { available_from_basis: "source_available_now" }],
    ["not independently confirmed, no basis", { available_from_independently_confirmed: false }],
  ])("labels %s unconfirmed", (_label, metadata) => {
    expect(isAvailabilityUnconfirmed(metadata)).toBe(true);
  });

  it("keeps a date the source actually stated confirmed", () => {
    expect(
      isAvailabilityUnconfirmed({
        available_from_independently_confirmed: false,
        available_from_basis: "source_explicit_date",
      }),
    ).toBe(false);
    expect(
      isAvailabilityUnconfirmed({
        available_from_independently_confirmed: false,
        available_from_basis: "source_rented_until",
      }),
    ).toBe(false);
  });

  it("does not label ordinary listings or non-objects", () => {
    expect(isAvailabilityUnconfirmed({})).toBe(false);
    expect(isAvailabilityUnconfirmed(null)).toBe(false);
    expect(isAvailabilityUnconfirmed("nope")).toBe(false);
  });
});
