import { describe, expect, it } from "vitest";

import { canAccessOwnerRestaurant } from "@/lib/restaurants/restaurant-owner-load";

describe("canAccessOwnerRestaurant", () => {
  const partnerA = "11111111-1111-4111-8111-111111111111";
  const partnerB = "22222222-2222-4222-8222-222222222222";

  it("allows the assigned partner member", () => {
    expect(
      canAccessOwnerRestaurant({
        partnerId: partnerA,
        authorizedPartnerIds: [partnerA],
        isAdmin: false,
      }),
    ).toBe(true);
  });

  it("denies another partner", () => {
    expect(
      canAccessOwnerRestaurant({
        partnerId: partnerA,
        authorizedPartnerIds: [partnerB],
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it("denies an unassigned restaurant to a partner", () => {
    expect(
      canAccessOwnerRestaurant({
        partnerId: null,
        authorizedPartnerIds: [partnerA],
        isAdmin: false,
      }),
    ).toBe(false);
  });

  it("keeps admin access to any restaurant", () => {
    expect(
      canAccessOwnerRestaurant({
        partnerId: partnerB,
        authorizedPartnerIds: [],
        isAdmin: true,
      }),
    ).toBe(true);
  });
});
